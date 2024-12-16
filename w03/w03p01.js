"use strict";

// Execute the main function once the window has fully loaded
window.onload = function () {
    main();
}

async function main() {
    // Check if WebGPU is supported in the current browser
    if (!navigator.gpu) {
        console.error("WebGPU is not supported in this browser.");
        alert("WebGPU is not supported in this browser. Please use a compatible browser.");
        return;
    }

    // Request the GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter.");
        alert("Failed to get GPU adapter. WebGPU might not be available.");
        return;
    }

    // Request the GPU device
    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device.");
        alert("Failed to get GPU device. WebGPU might not be available.");
        return;
    }

    // Get the canvas element and its WebGPU rendering context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context. WebGPU might not be available.");
        return;
    }

    // Determine the preferred canvas format
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    // Configure the canvas context with the GPU device and format
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque", // Options: "opaque", "premultiplied", "blend"
    });

    // Get references to the Address Mode and Filter Mode select elements
    const addressModeSelect = document.getElementById("addressmode");
    const filterModeSelect = document.getElementById("filtermode");

    /**
     * Loads a texture from a given filename and creates a sampler based on current settings.
     * @param {GPUDevice} device - The GPU device.
     * @param {string} filename - The path to the image file.
     * @returns {Promise<GPUTexture>} - The loaded GPU texture with an associated sampler.
     */
    async function loadTexture(device, filename) {
        // Create and load the image
        const img = new Image();
        img.src = filename;
        await img.decode();

        // Create an off-screen canvas to draw the image
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        const imageCanvasContext = imageCanvas.getContext('2d');
        imageCanvasContext.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
        const imageData = imageCanvasContext.getImageData(0, 0, imageCanvas.width, imageCanvas.height);

        // Flip the image vertically (WebGPU expects the origin at the top-left)
        const textureData = new Uint8Array(img.width * img.height * 4);
        for (let i = 0; i < img.height; ++i) {
            for (let j = 0; j < img.width; ++j) {
                for (let k = 0; k < 4; ++k) {
                    textureData[(i * img.width + j) * 4 + k] = imageData.data[((img.height - i - 1) * img.width + j) * 4 + k];
                }
            }
        }

        // Create the texture
        const texture = device.createTexture({
            size: [img.width, img.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        });

        // Write the texture data to the GPU
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

        // Create the sampler based on current select values
        const sampler = device.createSampler({
            addressModeU: addressModeSelect.value,
            addressModeV: addressModeSelect.value,
            minFilter: filterModeSelect.value,
            magFilter: filterModeSelect.value,
        });

        // Attach the sampler to the texture object for easy access
        texture.sampler = sampler;

        return texture;
    }

    // Load the initial texture
    const texture = await loadTexture(device, "grass.jpg");

    // Create the shader module from WGSL code
    const wgslCode = document.getElementById("wgsl").textContent;
    const shaderModule = device.createShaderModule({
        code: wgslCode,
    });

    // Create the render pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto", // Automatically generate layout based on shader
        vertex: {
            module: shaderModule,
            entryPoint: "main_vs", // Vertex shader entry point
        },
        fragment: {
            module: shaderModule,
            entryPoint: "main_fs", // Fragment shader entry point
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: "triangle-strip", // Draw triangles as a strip
        },
    });

    // Create the initial bind group
    let bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: texture.sampler },
            { binding: 1, resource: texture.createView() },
        ],
    });

    /**
     * Updates the sampler based on the current select values.
     */
    function updateSampler() {
        // Recreate the sampler with updated settings
        const newSampler = device.createSampler({
            addressModeU: addressModeSelect.value,
            addressModeV: addressModeSelect.value,
            minFilter: filterModeSelect.value,
            magFilter: filterModeSelect.value,
        });

        // Update the texture's sampler reference
        texture.sampler = newSampler;
    }

    /**
     * Event handler for Address Mode changes.
     */
    addressModeSelect.addEventListener("change", function () {
        updateSampler();

        // Recreate the bind group with the new sampler
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: texture.sampler },
                { binding: 1, resource: texture.createView() },
            ],
        });

        // Render the updated frame
        requestAnimationFrame(render);
    });

    /**
     * Event handler for Filter Mode changes.
     */
    filterModeSelect.addEventListener("change", function () {
        updateSampler();

        // Recreate the bind group with the new sampler
        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: texture.sampler },
                { binding: 1, resource: texture.createView() },
            ],
        });

        // Render the updated frame
        requestAnimationFrame(render);
    });

    // Initial sampler update to ensure sampler is set correctly
    updateSampler();

    /**
     * Renders a frame by encoding and submitting rendering commands.
     */
    function render() {
        // Create a command encoder to record GPU commands
        const encoder = device.createCommandEncoder();

        // Begin a render pass targeting the current texture of the canvas
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(), // Current canvas texture
                loadOp: "clear",      // Clear the canvas before rendering
                clearValue: {         // Clear color (black with full opacity)
                    r: 0.0,
                    g: 0.0,
                    b: 0.0,
                    a: 1.0,
                },
                storeOp: "store",     // Store the rendered result in the texture
            }],
        });

        // Set the pipeline and bind groups for the render pass
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);

        // Issue a draw call for 4 vertices (full-screen quad)
        pass.draw(4);

        // End the render pass
        pass.end();

        // Finalize the command buffer and submit it to the GPU queue
        device.queue.submit([encoder.finish()]);
    }

    // Initial render call to display the scene
    render();
}
