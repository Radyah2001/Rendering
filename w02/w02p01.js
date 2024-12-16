"use strict";

window.onload = async () => {
    await main();
};

async function main() {
    // Check if WebGPU is supported
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported in this browser. Please use a compatible browser.");
        return;
    }

    // Request the GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        alert("Failed to get GPU adapter. WebGPU might not be available.");
        return;
    }

    // Request the GPU device
    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        alert("Failed to get GPU device. WebGPU might not be available.");
        return;
    }

    // Get the canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context. WebGPU might not be available.");
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

    // Calculate aspect ratio and initial zoom
    const aspectRatio = canvas.width / canvas.height;
    let zoom = 1.0;

    // Create uniform buffer and bind group
    const uniformBuffer = device.createBuffer({
        size: 3 * Float32Array.BYTES_PER_ELEMENT, // aspect_ratio, cam_constant, gamma
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

    // Initialize uniform data
    const uniforms = new Float32Array([aspectRatio, 1.0, 2.2]); // aspect_ratio, cam_constant, gamma
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        uniforms.buffer,
        uniforms.byteOffset,
        uniforms.byteLength
    );

    // Get the zoom slider element
    const zoomSlider = document.getElementById("zoom-slider");
    zoomSlider.value = zoom; // Set initial slider value

    // Add event listener for zoom changes
    zoomSlider.addEventListener("input", (event) => {
        zoom = parseFloat(event.target.value);
        uniforms[1] = zoom; // Update cam_constant
        device.queue.writeBuffer(
            uniformBuffer,
            0,
            uniforms.buffer,
            uniforms.byteOffset,
            uniforms.byteLength
        );
        requestAnimationFrame(render);
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
        pass.draw(4); // Draw 4 vertices forming two triangles (triangle strip)
        pass.end();

        device.queue.submit([encoder.finish()]);
    }

    // Initial render
    render();
}
