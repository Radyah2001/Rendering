"use strict";

window.onload = () => { main(); };

async function main() {
    // Check if WebGPU is supported
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported. Please use a compatible browser.");
        return;
    }

    // Request GPU adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        alert("Failed to get GPU adapter.");
        return;
    }

    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        alert("Failed to get GPU device.");
        return;
    }

    // Get canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context.");
        return;
    }

    // Configure the canvas context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque", // "opaque", "premultiplied", or "blend"
    });

    // Load shader code from script
    const wgslModule = device.createShaderModule({
        code: document.getElementById("wgsl").text
    });

    // Create a simple render pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: wgslModule,
            entryPoint: "main_vs",
        },
        fragment: {
            module: wgslModule,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    // Load 3D model (OBJ file)
    const objFilename = "bunny.obj";
    let drawingInfo = await readOBJFile(objFilename, 1, true);
    if (!drawingInfo) {
        console.error("Failed to load OBJ file:", objFilename);
        return;
    }

    // Uniform buffer for camera or other settings
    const uniformBuffer = device.createBuffer({
        size: 20, 
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Compute aspect and camera constant
    const aspect = canvas.width / canvas.height;
    const cameraConstant = 3.5;
    const uniforms = new Float32Array([aspect, cameraConstant]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Prepare bind group once buffers are ready
    let bindGroup = null;

    function onReadComplete(device, pipeline) {
        // Set up buffers and bind groups based on loaded model data
        const buffers = {
            positions: null,
            normals: null,
            colors: null,
            indices: null,
            color: null,
            mat_indices: null,
            treeIds: null,
            bspTree: null,
            bspPlanes: null,
            aabb: null,
        };

        // Prepare material colors from loaded materials
        const matColors = [];
        for (let i = 0; i < drawingInfo.materials.length; i++) {
            let mat = drawingInfo.materials[i];
            // Combine material color and emission
            matColors.push(mat.color.r + mat.emission.r);
            matColors.push(mat.color.g + mat.emission.g);
            matColors.push(mat.color.b + mat.emission.b);
            matColors.push(mat.color.a + mat.emission.a);
        }

        // Create and write buffers
        buffers.color = device.createBuffer({
            size: matColors.length * 4, // 4 bytes per float
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        buffers.mat_indices = device.createBuffer({
            size: drawingInfo.mat_indices.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.mat_indices, 0, drawingInfo.mat_indices);

        // Build BSP tree buffers
        build_bsp_tree(drawingInfo, device, buffers);

        // Create bind group with all buffers
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: buffers.aabb } },
                { binding: 2, resource: { buffer: buffers.positions } },
                { binding: 3, resource: { buffer: buffers.indices } },
                { binding: 4, resource: { buffer: buffers.normals } },
                { binding: 5, resource: { buffer: buffers.color } },
                { binding: 6, resource: { buffer: buffers.mat_indices } },
                { binding: 7, resource: { buffer: buffers.treeIds } },
                { binding: 8, resource: { buffer: buffers.bspTree } },
                { binding: 9, resource: { buffer: buffers.bspPlanes } },
            ],
        });

        return bindGroup;
    }

    // Animation and rendering
    function animate() {
        bindGroup = onReadComplete(device, pipeline);
        render();
    }

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }]
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4); // Draw a quad

        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    // Start animation
    animate();
}
