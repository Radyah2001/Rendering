"use strict";

window.onload = () => { main(); };

async function main() {
    // Check for WebGPU support
    if (!navigator.gpu) {
        console.error("WebGPU is not supported by this browser.");
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

    // Configure the canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context.");
        return;
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque",
    });

    // Load WGSL shader code
    const shaderModule = device.createShaderModule({
        code: document.getElementById("wgsl").text
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
                { format: canvasFormat },
                { format: "rgba32float" }
            ]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    // Helper function to load textures
    async function loadTexture(device, filename) {
        const response = await fetch(filename);
        const blob = await response.blob();
        const img = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
        const texture = device.createTexture({
            size: [img.width, img.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
        });
        device.queue.copyExternalImageToTexture(
            { source: img, flipY: true },
            { texture: texture },
            { width: img.width, height: img.height }
        );
        texture.sampler = device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            minFilter: "nearest",
            magFilter: "nearest",
        });
        return texture;
    }

    // Set up textures for progressive rendering
    const textures = {
        width: canvas.width,
        height: canvas.height,
        renderSrc: device.createTexture({
            size: [canvas.width, canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            format: 'rgba32float',
        }),
        renderDst: device.createTexture({
            size: [canvas.width, canvas.height],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba32float',
        }),
        env: await loadTexture(device, "luxo_pxr_campus.jpg"),
    };

    // Load 3D model (OBJ)
    const objFilename = "teapot.obj";
    const drawingInfo = await readOBJFile(objFilename, 1, true);
    if (!drawingInfo) {
        console.error("Failed to load OBJ model:", objFilename);
        return;
    }

    let bindGroup;

    // Prepare buffers and bind group after model data is loaded
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

        // Prepare material colors (color + emission)
        const matColors = [];
        for (let i = 0; i < drawingInfo.materials.length; i++) {
            const mat = drawingInfo.materials[i];
            matColors.push(mat.color.r, mat.color.g, mat.color.b, mat.color.a,
                           mat.emission.r, mat.emission.g, mat.emission.b, mat.emission.a);
        }

        // GPU buffer for material colors
        buffers.color = device.createBuffer({
            size: drawingInfo.materials.length * 32, // 8 floats * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        // GPU buffer for light indices
        buffers.light_indices = device.createBuffer({
            size: drawingInfo.light_indices.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.light_indices, 0, drawingInfo.light_indices);

        build_bsp_tree(drawingInfo, device, buffers);

        // Create bind group with buffers and textures
        const group = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: uniformUIBuffer } },
                { binding: 2, resource: { buffer: buffers.aabb } },
                { binding: 3, resource: { buffer: buffers.attribs } },
                { binding: 4, resource: { buffer: buffers.indices } },
                { binding: 5, resource: { buffer: buffers.color } },
                // Uncomment this if you need light indices: { binding: 6, resource: { buffer: buffers.light_indices } },
                { binding: 7, resource: { buffer: buffers.treeIds } },
                { binding: 8, resource: { buffer: buffers.bspTree } },
                { binding: 9, resource: { buffer: buffers.bspPlanes } },
                { binding: 11, resource: textures.renderDst.createView() },
                { binding: 12, resource: textures.env.createView() },
            ],
        });

        return group;
    }

    // Uniform buffers for camera and UI data
    const uniformBuffer = device.createBuffer({
        size: 20, // Adjust if needed
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformUIBuffer = device.createBuffer({
        size: 12, // Adjust if needed
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Set camera aspect and constants
    const aspect = canvas.width / canvas.height;
    const camConst = 1;
    const uniforms = new Float32Array([aspect, camConst]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Frame counter for progressive rendering
    let frame = 0;
    let uniformsUI = new Float32Array([canvas.width, canvas.height, frame]);
    device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);

    // Toggle progressive rendering
    let progressing = true;
    const progressiveButton = document.getElementById("Progressive");
    progressiveButton.addEventListener("click", () => {
        progressing = !progressing;
        if (progressing) {
            animate();
        }
    });

    // Create initial bind group
    bindGroup = onReadComplete(device, pipeline);

    // Animation loop
    function animate() {
        render();
        if (progressing) {
            frame++;
            uniformsUI = new Uint32Array([canvas.width, canvas.height, frame]);
            device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);
            requestAnimationFrame(animate);
        }
    }
    animate();

    function render() {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: textures.renderSrc.createView(),
                    loadOp: frame === 0 ? "clear" : "load",
                    storeOp: "store"
                }
            ]
        });

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(4); // Draw a quad
        pass.end();

        // Copy rendered data from renderSrc to renderDst
        encoder.copyTextureToTexture(
            { texture: textures.renderSrc },
            { texture: textures.renderDst },
            [textures.width, textures.height]
        );

        device.queue.submit([encoder.finish()]);
    }
}
