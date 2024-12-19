"use strict";

window.onload = () => { main(); };

async function main() {
    // Check WebGPU support
    if (!navigator.gpu) {
        console.error("WebGPU not supported by this browser.");
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

    // Get canvas and WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context.");
        return;
    }

    // Configure canvas context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque",
    });

    // Load WGSL shader
    const shaderModule = device.createShaderModule({
        code: document.getElementById("wgsl").text
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
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    // Setup jittering for subdivisions
    const jitter = new Float32Array(400); // Enough for up to 10x10 subdivisions
    const jitterBuffer = device.createBuffer({
        size: jitter.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    const subdivsMenu = document.getElementById("subdivsMenu");

    function computeJitters(jitterArray, pixelSize, subdivs) {
        const step = pixelSize / subdivs;
        if (subdivs < 2) {
            jitterArray[0] = 0.0;
            jitterArray[1] = 0.0;
        } else {
            for (let i = 0; i < subdivs; i++) {
                for (let j = 0; j < subdivs; j++) {
                    const idx = (i * subdivs + j) * 2;
                    jitterArray[idx] = (Math.random() + j) * step - pixelSize * 0.5;
                    jitterArray[idx + 1] = (Math.random() + i) * step - pixelSize * 0.5;
                }
            }
        }
    }

    const pixelSize = 1 / canvas.height;
    computeJitters(jitter, pixelSize, subdivsMenu.value);
    device.queue.writeBuffer(jitterBuffer, 0, jitter);

    subdivsMenu.addEventListener("change", () => {
        const subdivs = subdivsMenu.value;
        uniforms[3] = subdivs; // Update uniforms if needed
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        computeJitters(jitter, pixelSize, subdivs);
        device.queue.writeBuffer(jitterBuffer, 0, jitter);
        animate();
    });

    // Load OBJ model
    const objFilename = "CornellBox.obj";
    let drawingInfo = await readOBJFile(objFilename, 1, true);
    if (!drawingInfo) {
        console.error("Failed to load OBJ model:", objFilename);
        return;
    }

    let bindGroup;

    // Called once model data is ready to create buffers and bind group
    function onReadComplete(device, pipeline) {
        const buffers = {
            attribs: null,
            color: null,
            colors: null,
            indices: null,
            light_indices: null,
            treeIds: null,
            bspTree: null,
            bspPlanes: null,
            aabb: null,
        };

        // Prepare material colors
        const matColors = [];
        for (let i = 0; i < drawingInfo.materials.length; i++) {
            const mat = drawingInfo.materials[i];
            // Combine color and emission
            matColors.push(mat.color.r + mat.emission.r);
            matColors.push(mat.color.g + mat.emission.g);
            matColors.push(mat.color.b + mat.emission.b);
            matColors.push(mat.color.a + mat.emission.a);
        }

        buffers.color = device.createBuffer({
            size: drawingInfo.materials.length * 16, // 4 floats * 4 bytes/float
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        buffers.light_indices = device.createBuffer({
            size: drawingInfo.light_indices.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.light_indices, 0, drawingInfo.light_indices);

        build_bsp_tree(drawingInfo, device, buffers);

        // Create bind group
        const group = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: buffers.aabb } },
                { binding: 2, resource: { buffer: buffers.attribs } },
                { binding: 3, resource: { buffer: buffers.indices } },
                { binding: 4, resource: { buffer: buffers.color } },
                { binding: 5, resource: { buffer: buffers.light_indices } },
                { binding: 6, resource: { buffer: buffers.treeIds } },
                { binding: 7, resource: { buffer: buffers.bspTree } },
                { binding: 8, resource: { buffer: buffers.bspPlanes } },
                { binding: 9, resource: { buffer: jitterBuffer } },
            ],
        });

        return group;
    }

    // Uniform buffer setup
    const uniformBuffer = device.createBuffer({
        size: 20, // adjust as needed
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width / canvas.height;
    let camConst = 1;
    let subdivs = subdivsMenu.value;
    const uniforms = new Float32Array([aspect, camConst, subdivs]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    function animate() {
        bindGroup = onReadComplete(device, pipeline);
        render();
    }
    animate();

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }],
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4);
        pass.end();

        device.queue.submit([encoder.finish()]);
    }
}
