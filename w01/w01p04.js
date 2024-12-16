"use strict";

window.onload = () => {
    main();
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

    // Create the shader module from WGSL code
    const wgslCode = document.getElementById("wgsl").textContent;
    const shaderModule = device.createShaderModule({
        code: wgslCode,
    });

    // Create the render pipeline
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

    // Create a command encoder
    const encoder = device.createCommandEncoder();

    // Begin a render pass
    const renderPassDescriptor = {
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.5, g: 0.7, b: 1.0, a: 1.0 }, // Light blue background
            },
        ],
    };

    const pass = encoder.beginRenderPass(renderPassDescriptor);

    // Set the pipeline and issue draw call
    pass.setPipeline(pipeline);
    pass.draw(4, 1, 0, 0); // Draw 4 vertices, 1 instance, starting at vertex 0 and instance 0

    // End the render pass
    pass.end();

    // Submit the commands
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
}
