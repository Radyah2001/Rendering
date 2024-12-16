"use strict";

// Execute the main function once the DOM is fully loaded
window.addEventListener("DOMContentLoaded", main);

/**
 * The main function initializes WebGPU, sets up the rendering pipeline,
 * loads the OBJ model, and starts the render loop.
 */
async function main() {
    // Check for WebGPU support
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported in this browser. Please use a compatible browser.");
        return;
    }

    // Initialize GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        alert("Failed to get GPU adapter. WebGPU might not be available.");
        return;
    }

    // Initialize GPU device
    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        alert("Failed to get GPU device. WebGPU might not be available.");
        return;
    }

    // Setup the canvas and WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    if (!canvas) {
        console.error("Canvas element with ID 'webgpu-canvas' not found.");
        alert("Canvas element not found.");
        return;
    }

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

    // Load and parse the OBJ model
    const objFilename = "teapot.obj";
    const drawingInfo = await readOBJFile(objFilename, 1, true); // Assumes readOBJFile is defined elsewhere
    if (!drawingInfo) {
        console.error("Failed to load OBJ file.");
        alert("Failed to load OBJ file.");
        return;
    }

    // Create GPU buffers
    const positionsBuffer = createBuffer(device, drawingInfo.vertices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const indicesBuffer = createBuffer(device, drawingInfo.indices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const normalsBuffer = createBuffer(device, drawingInfo.normals, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

    // Create uniform buffer
    const uniformBuffer = device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT * 2, // aspect ratio and zoom
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Set uniform data
    updateUniforms(device, uniformBuffer, canvas);

    // Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: positionsBuffer } },
            { binding: 2, resource: { buffer: indicesBuffer } },
            { binding: 3, resource: { buffer: normalsBuffer } },
        ],
    });

    function animate() {
        render(device, context, pipeline, bindGroup);
    }

    animate();
}

/**
 * Creates a GPU buffer and uploads data to it.
 * @param {GPUDevice} device - The GPU device.
 * @param {ArrayBuffer | TypedArray} data - The data to upload.
 * @param {number} usage - The usage flags for the buffer.
 * @returns {GPUBuffer} The created GPU buffer.
 */
function createBuffer(device, data, usage) {
    const buffer = device.createBuffer({
        size: data.byteLength,
        usage,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
}

/**
 * Updates the uniform buffer with aspect ratio and zoom level.
 * @param {GPUDevice} device - The GPU device.
 * @param {GPUBuffer} uniformBuffer - The uniform buffer to update.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 */
function updateUniforms(device, uniformBuffer, canvas) {
    const aspect = canvas.width / canvas.height;
    const zoom = 2.5;
    const uniforms = new Float32Array([aspect, zoom]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
}

/**
 * Renders a frame.
 * @param {GPUDevice} device - The GPU device.
 * @param {GPUCanvasContext} context - The WebGPU canvas context.
 * @param {GPURenderPipeline} pipeline - The render pipeline.
 * @param {GPUBindGroup} bindGroup - The bind group.
 */
function render(device, context, pipeline, bindGroup) {
    const commandEncoder = device.createCommandEncoder();
    const currentTexture = context.getCurrentTexture();
    const renderPassDescriptor = {
        colorAttachments: [{
            view: currentTexture.createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1 }, // Clear to black
            storeOp: "store",
        }],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4); // Adjust the vertex count as needed
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
}
