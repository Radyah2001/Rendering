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

    // End the render pass
    pass.end();

    // Submit the commands
    device.queue.submit([encoder.finish()]);
}