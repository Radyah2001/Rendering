"use strict";

window.onload = async () => {
    await main();
};

async function main() {
    // Check if WebGPU is supported
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        return;
    }

    // Request the GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        return;
    }

    // Request the GPU device
    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        return;
    }

    // Get the canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        return;
    }

    // Configure the canvas context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque", // Options: "opaque", "premultiplied", "blend"
    });

    // Load and compile WGSL shader code
    const wgslCode = document.getElementById("wgsl").textContent;
    const shaderModule = device.createShaderModule({
        code: wgslCode,
    });

    // Create render pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "main_vs",
        },
        fragment: {
            module: shaderModule,
            entryPoint: "main_fs",
            targets: [
                {
                    format: canvasFormat,
                },
            ],
        },
        primitive: {
            topology: "triangle-strip",
            cullMode: "none", // Options: "none", "front", "back"
        },
    });

    const aspectRatio = canvas.width / canvas.height;
    let zoom = 1.0;

    // Create uniform buffer and bind group
    const uniformBuffer = device.createBuffer({
        size: 2 * Float32Array.BYTES_PER_ELEMENT, // Two floats (aspect_ratio, zoom)
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer,
                },
            },
        ],
    });

    // Function to render the scene
    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    clearValue: { r: 0.5, g: 0.7, b: 1.0, a: 1.0 }, // Light blue background
                    storeOp: "store",
                },
            ],
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, uniformBindGroup);
        pass.draw(4);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }

    // Initial render with default zoom
    updateUniformBuffer(aspectRatio, zoom);
    render();

    // Handle zoom changes
    const zoomSlider = document.getElementById("zoom-slider");
    zoomSlider.addEventListener("input", (event) => {
        zoom = parseFloat(event.target.value);
        updateUniformBuffer(aspectRatio, zoom);
        render();
    });

    // Function to update the uniform buffer
    function updateUniformBuffer(aspect, zoomLevel) {
        const bufferData = new Float32Array([aspect, zoomLevel]);
        device.queue.writeBuffer(
            uniformBuffer,
            0,
            bufferData.buffer,
            bufferData.byteOffset,
            bufferData.byteLength
        );
    }
}
