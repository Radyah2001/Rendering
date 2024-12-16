"use strict";

window.onload = () => {
    main();
};

async function main() {
    // Check if WebGPU is supported
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported in this browser. Please use a compatible browser.");
        return;
    }

    // Request GPU adapter and device
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

    // Get canvas and WebGPU context
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

    // Get UI elements
    const addressModeElement = document.getElementById("addressmode");
    const filterModeElement = document.getElementById("filtermode");
    const subdivsMenu = document.getElementById("subdivsMenu");
    const zoomSlider = document.getElementById("zoom-slider");
    const shaderSphereMenu = document.getElementById("shaderSphereMenu");

    // Load texture
    const texture = await loadTexture(device, "grass.jpg", addressModeElement, filterModeElement);

    // Create shader module and render pipeline
    const shaderModule = device.createShaderModule({
        code: document.getElementById("wgsl").textContent,
    });

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

    // Create buffers
    const jitter = new Float32Array(400); // Allowing subdivisions from 1 to 10
    const jitterBuffer = device.createBuffer({
        size: jitter.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });

    const uniformBuffer = device.createBuffer({
        size: 20, // Number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const vPositions = [
        vec4(-0.2, 0.1, 0.9, 0.0),
        vec4(0.2, 0.1, 0.9, 0.0),
        vec4(-0.2, 0.1, -0.1, 0.0),
    ];
    const vPositionsBuffer = device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT * flatten(vPositions).length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vPositionsBuffer, 0, new Float32Array(flatten(vPositions)));

    const meshFaces = [vec4(0, 1, 2, 0)];
    const meshFacesBuffer = device.createBuffer({
        size: Uint32Array.BYTES_PER_ELEMENT * flatten(meshFaces).length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(meshFacesBuffer, 0, new Uint32Array(flatten(meshFaces)));

    // Create initial bind group
    let bindGroup = createBindGroup(
        device,
        pipeline,
        uniformBuffer,
        texture,
        jitterBuffer,
        vPositionsBuffer,
        meshFacesBuffer
    );

    // Compute initial jitters and write to buffer
    const pixelSize = 1 / canvas.height;
    let subdivs = parseInt(subdivsMenu.value, 10);
    computeJitters(jitter, pixelSize, subdivs);
    device.queue.writeBuffer(jitterBuffer, 0, jitter);

    // Write initial uniforms
    const aspect = canvas.width / canvas.height;
    let zoom = 1.0;
    let shader = 1;
    const uniforms = new Float32Array([aspect, zoom, shader, subdivs]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Event Listeners
    zoomSlider.addEventListener("input", (event) => {
        zoom = parseFloat(event.target.value);
        uniforms[1] = zoom;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestRender();
    });

    shaderSphereMenu.addEventListener("change", (event) => {
        shader = parseInt(event.target.value, 10);
        uniforms[2] = shader;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestRender();
    });

    subdivsMenu.addEventListener("change", (event) => {
        subdivs = parseInt(event.target.value, 10);
        uniforms[3] = subdivs;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        computeJitters(jitter, pixelSize, subdivs);
        device.queue.writeBuffer(jitterBuffer, 0, jitter);
        requestRender();
    });

    addressModeElement.addEventListener("change", () => {
        updateSampler();
        bindGroup = createBindGroup(
            device,
            pipeline,
            uniformBuffer,
            texture,
            jitterBuffer,
            vPositionsBuffer,
            meshFacesBuffer
        );
        requestRender();
        console.log(addressModeElement.value);
    });

    filterModeElement.addEventListener("change", () => {
        updateSampler();
        bindGroup = createBindGroup(
            device,
            pipeline,
            uniformBuffer,
            texture,
            jitterBuffer,
            vPositionsBuffer,
            meshFacesBuffer
        );
        requestRender();
    });

    // Update sampler based on UI selections
    function updateSampler() {
        texture.sampler = device.createSampler({
            addressModeU: addressModeElement.value,
            addressModeV: addressModeElement.value,
            minFilter: filterModeElement.value,
            magFilter: filterModeElement.value,
        });
    }

    updateSampler();

    // Render function
    function render() {
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                },
            ],
        });

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(4);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    // Request render frame
    function requestRender() {
        requestAnimationFrame(render);
    }

    // Initial render
    render();

    // Helper Functions

    /**
     * Loads a texture from a given filename.
     * @param {GPUDevice} device - The GPU device.
     * @param {string} filename - The path to the image file.
     * @param {HTMLElement} addressModeElement - The address mode UI element.
     * @param {HTMLElement} filterModeElement - The filter mode UI element.
     * @returns {GPUTexture} The loaded texture.
     */
    async function loadTexture(device, filename, addressModeElement, filterModeElement) {
        const img = new Image();
        img.src = filename;
        await img.decode();

        // Draw image to canvas to extract pixel data
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        const ctx = imageCanvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        // Flip the image vertically
        const textureData = new Uint8Array(img.width * img.height * 4);
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                for (let c = 0; c < 4; c++) {
                    textureData[(y * img.width + x) * 4 + c] =
                        imageData.data[((img.height - y - 1) * img.width + x) * 4 + c];
                }
            }
        }

        // Create GPU texture
        const texture = device.createTexture({
            size: [img.width, img.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        });

        device.queue.writeTexture(
            { texture: texture },
            textureData,
            {
                offset: 0,
                bytesPerRow: img.width * 4,
                rowsPerImage: img.height,
            },
            [img.width, img.height, 1]
        );

        // Create sampler
        texture.sampler = device.createSampler({
            addressModeU: addressModeElement.value,
            addressModeV: addressModeElement.value,
            minFilter: filterModeElement.value,
            magFilter: filterModeElement.value,
        });

        return texture;
    }

    /**
     * Creates a bind group with the provided resources.
     * @param {GPUDevice} device - The GPU device.
     * @param {GPURenderPipeline} pipeline - The render pipeline.
     * @param {GPUBuffer} uniformBuffer - The uniform buffer.
     * @param {GPUTexture} texture - The texture.
     * @param {GPUBuffer} jitterBuffer - The jitter buffer.
     * @param {GPUBuffer} vPositionsBuffer - The vertex positions buffer.
     * @param {GPUBuffer} meshFacesBuffer - The mesh faces buffer.
     * @returns {GPUBindGroup} The created bind group.
     */
    function createBindGroup(
        device,
        pipeline,
        uniformBuffer,
        texture,
        jitterBuffer,
        vPositionsBuffer,
        meshFacesBuffer
    ) {
        return device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: texture.sampler },
                { binding: 2, resource: texture.createView() },
                { binding: 3, resource: { buffer: jitterBuffer } },
                { binding: 4, resource: { buffer: vPositionsBuffer } },
                { binding: 5, resource: { buffer: meshFacesBuffer } },
            ],
        });
    }

    /**
     * Computes jitter values based on pixel size and subdivisions.
     * @param {Float32Array} jitter - The jitter array to populate.
     * @param {number} pixelSize - The size of a pixel.
     * @param {number} subdivs - The number of subdivisions.
     */
    function computeJitters(jitter, pixelSize, subdivs) {
        const step = pixelSize / subdivs;
        if (subdivs < 2) {
            jitter[0] = 0.0;
            jitter[1] = 0.0;
            return;
        }

        for (let i = 0; i < subdivs; i++) {
            for (let j = 0; j < subdivs; j++) {
                const idx = (i * subdivs + j) * 2;
                jitter[idx] = (Math.random() + j) * step - pixelSize * 0.5;
                jitter[idx + 1] = (Math.random() + i) * step - pixelSize * 0.5;
            }
        }
    }
}
