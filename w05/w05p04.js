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
    const shaderCodeElement = document.getElementById("wgsl");
    if (!shaderCodeElement) {
        console.error("Shader code element with ID 'wgsl' not found.");
        alert("Shader code not found.");
        return;
    }
    const shaderCode = shaderCodeElement.textContent;
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
    const objFilename = "CornellBoxWithBlocks.obj";
    const drawingInfo = await readOBJFile(objFilename, 1, true);
    if (!drawingInfo) {
        console.error("Failed to load OBJ file.");
        alert("Failed to load OBJ file.");
        return;
    }

    // Create GPU buffers
    const positionsBuffer = createBuffer(device, drawingInfo.vertices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const indicesBuffer = createBuffer(device, drawingInfo.indices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const normalsBuffer = createBuffer(device, drawingInfo.normals, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

    // Extract material data
    const { materialColorBuffer, materialEmissionBuffer, matIndicesBuffer } = createMaterialBuffers(device, drawingInfo);

    // Create uniform buffer
    const uniformBuffer = device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT * 2, // aspect ratio and cam_const
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
            { binding: 4, resource: { buffer: materialColorBuffer } },
            { binding: 5, resource: { buffer: materialEmissionBuffer } },
            { binding: 6, resource: { buffer: matIndicesBuffer } },
        ],
    });

    // Start the render loop
    requestAnimationFrame(() => animate(device, context, pipeline, bindGroup));
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
 * Extracts material data from drawingInfo and creates corresponding GPU buffers.
 * @param {GPUDevice} device - The GPU device.
 * @param {Object} drawingInfo - The drawing information containing materials.
 * @returns {Object} An object containing the material buffers.
 */
function createMaterialBuffers(device, drawingInfo) {
    const matColors = [];
    const matEmission = [];

    drawingInfo.materials.forEach(material => {
        matColors.push(material.color.r, material.color.g, material.color.b, material.color.a);
        matEmission.push(material.emission.r, material.emission.g, material.emission.b, material.emission.a);
    });

    const materialColorBuffer = createBuffer(device, new Float32Array(matColors), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const materialEmissionBuffer = createBuffer(device, new Float32Array(matEmission), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const matIndicesBuffer = createBuffer(device, drawingInfo.mat_indices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);

    return { materialColorBuffer, materialEmissionBuffer, matIndicesBuffer };
}

/**
 * Updates the uniform buffer with aspect ratio and camera constant.
 * @param {GPUDevice} device - The GPU device.
 * @param {GPUBuffer} uniformBuffer - The uniform buffer to update.
 * @param {HTMLCanvasElement} canvas - The canvas element.
 */
function updateUniforms(device, uniformBuffer, canvas) {
    const aspect = canvas.width / canvas.height;
    const camConst = 1.0;
    const uniforms = new Float32Array([aspect, camConst]);
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

/**
 * The animation loop that renders each frame.
 * @param {GPUDevice} device - The GPU device.
 * @param {GPUCanvasContext} context - The WebGPU canvas context.
 * @param {GPURenderPipeline} pipeline - The render pipeline.
 * @param {GPUBindGroup} bindGroup - The bind group.
 */
function animate(device, context, pipeline, bindGroup) {
    render(device, context, pipeline, bindGroup);
    requestAnimationFrame(() => animate(device, context, pipeline, bindGroup));
}
