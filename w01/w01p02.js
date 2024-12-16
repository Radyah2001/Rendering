"use strict";

window.onload = () => {
    main();
};

async function main() {
    // Request the GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        return;
    }

    // Request the GPU device
    const device = await adapter.requestDevice();

    // Get the canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("WebGPU not supported on this browser.");
        return;
    }

    // Configure the canvas context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
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
            stripIndexFormat: "uint32", // Optional: Specify index format if needed
        },
    });

    // Create a command encoder
    const encoder = device.createCommandEncoder();

    // Begin a render pass
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0, g: 0, b: 0, a: 1 }, // Optional: Specify clear color
            },
        ],
    });

    // Set the pipeline and issue draw call
    pass.setPipeline(pipeline);
    pass.draw(4, 1, 0, 0); // Draw 4 vertices, 1 instance, starting at vertex 0 and instance 0

    // End the render pass
    pass.end();

    // Submit the commands
    device.queue.submit([encoder.finish()]);
}
