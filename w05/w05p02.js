"use strict";

window.addEventListener("DOMContentLoaded", main);

async function main() {
    // Check if WebGPU is supported
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported in this browser. Please use a compatible browser.");
        return;
    }

    // Initialize GPU adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        alert("Failed to get GPU adapter. WebGPU might not be available.");
        return;
    }

    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        alert("Failed to get GPU device. WebGPU might not be available.");
        return;
    }

    // Setup the canvas and WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context. WebGPU might not be available.");
        return;
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: canvasFormat,
        alphaMode: "opaque", // Options: "opaque", "premultiplied", "blend"
    });

    // Create shader module
    const shaderCode = document.getElementById("wgsl").textContent;
    const shaderModule = device.createShaderModule({ code: shaderCode });

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
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    // Load and parse the OBJ file
    const objFilename = "teapot.obj";
    const drawingInfo = await readOBJFile(objFilename, 1, true);
    if (!drawingInfo) {
        console.error("Failed to load OBJ file.");
        alert("Failed to load OBJ file.");
        return;
    }

    // Create buffers
    const positionsBuffer = device.createBuffer({
        size: drawingInfo.vertices.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(positionsBuffer, 0, drawingInfo.vertices);

    const indicesBuffer = device.createBuffer({
        size: drawingInfo.indices.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indicesBuffer, 0, drawingInfo.indices);

    const uniformBuffer = device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT * 2, // aspect and zoom
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Set uniform data
    const aspect = canvas.width / canvas.height;
    const zoom = 2.5;
    const uniforms = new Float32Array([aspect, zoom]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: positionsBuffer } },
            { binding: 2, resource: { buffer: indicesBuffer } },
        ],
    });

    // Render the scene
    function render() {
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: { r: 0, g: 0, b: 0, a: 1 }, // Optional: specify clear color
                storeOp: "store",
            }],
        });

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(4); // Adjust vertex count as needed
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    function animate() {
        render();
    }

    animate();
}
