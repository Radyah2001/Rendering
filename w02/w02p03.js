"use strict";

// Execute the main function once the window has fully loaded
window.onload = function () {
    main();
}

async function main() {
    // Check if WebGPU is supported
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

    // Get the canvas and its WebGPU context
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    if (!context) {
        console.error("Failed to get WebGPU context.");
        alert("Failed to get WebGPU context. WebGPU might not be available.");
        return;
    }

    // Determine the preferred canvas format
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    // Configure the canvas context with the device and format
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // Retrieve and create the WGSL shader module from the script tag
    const wgslShaderCode = document.getElementById("wgsl").textContent;
    const shaderModule = device.createShaderModule({
        code: wgslShaderCode
    });

    // Create the render pipeline with vertex and fragment shaders
    const pipeline = device.createRenderPipeline({
        layout: "auto", // Automatically generate layout based on shader
        vertex: {
            module: shaderModule,
            entryPoint: "main_vs", // Vertex shader entry point
        },
        fragment: {
            module: shaderModule,
            entryPoint: "main_fs", // Fragment shader entry point
            targets: [{
                format: canvasFormat // Output format matches the canvas
            }]
        },
        primitive: {
            topology: "triangle-strip", // Draw triangles as a strip
        },
    });

    // Define the size of the Uniforms buffer based on the WGSL Uniforms struct
    const uniformBufferSize = 12; // 3 floats x 4 bytes each = 12 bytes

    // Create a buffer for uniform data (aspect ratio, zoom, shader type)
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create a bind group to bind the uniform buffer to the shader
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0), // Bind group layout from the pipeline
        entries: [{
            binding: 0, // Corresponds to @binding(0) in WGSL
            resource: { buffer: uniformBuffer }
        }],
    });

    // Initialize uniform values
    const aspect = canvas.width / canvas.height; // Calculate aspect ratio
    let zoom = 1.0;                              // Initial zoom level
    let shader = 1;                              // Initial shader type (e.g., Diffuse)

    // Create a Float32Array to store uniform values
    // [aspect, zoom, shader]
    const uniforms = new Float32Array([aspect, zoom, shader]);

    // Write the initial uniform values to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Get references to UI elements
    const zoomSlider = document.getElementById("zoom-slider");
    const shaderSphereMenu = document.getElementById("shaderSphereMenu");

    // Event listener for the zoom slider input
    zoomSlider.addEventListener("input", function (ev) {
        // Parse the zoom value as a float
        zoom = parseFloat(ev.target.value);
        uniforms[1] = zoom; // Update the zoom value in the uniforms array

        // Write the updated uniforms to the buffer
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        // Request a new frame to render with updated zoom
        requestAnimationFrame(render);
    });

    // Event listener for the shader selection dropdown
    shaderSphereMenu.addEventListener("change", function (ev) {
        // Parse the selected shader value as a float
        shader = parseFloat(shaderSphereMenu.value);
        uniforms[2] = shader; // Update the shader type in the uniforms array

        console.log(`Selected Shader: ${shader}`);

        // Write the updated uniforms to the buffer
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        // Request a new frame to render with the selected shader
        requestAnimationFrame(render);
    });

    function render() {
        // Create a command encoder to record GPU commands
        const encoder = device.createCommandEncoder();

        // Begin a render pass to draw to the canvas
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(), // Current canvas texture
                loadOp: "clear",      // Clear the canvas before rendering
                clearValue: {         // Clear color (optional, defaults to black)
                    r: 0.0,
                    g: 0.0,
                    b: 0.0,
                    a: 1.0
                },
                storeOp: "store",     // Store the rendered result in the texture
            }]
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
