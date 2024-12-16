"use strict";
window.onload = function () { main(); }
async function main()
{
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

    // Configure the canvas context
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
        alphaMode: "opaque", // Options: "opaque", "premultiplied", "blend"
    });
    

    const wgsl = device.createShaderModule({
        code: document.getElementById("wgsl").text
    });
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: wgsl,
            entryPoint: "main_vs",
        },
        fragment: {
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
        }],
    });

    const aspect = canvas.width/canvas.height;
    var zoom = 1.0;
    var shader = 1;
    var uniforms = new Float32Array([aspect, zoom, shader]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    var zoomSlider = document.getElementById("zoom-slider");
    zoomSlider.addEventListener("input", function (ev)
    {
        zoom = ev.target.value;
        uniforms[1] = parseFloat(zoom);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    var shaderSphereMenu = document.getElementById("shaderSphereMenu");
    shaderSphereMenu.addEventListener("change", function (ev)
    {
        shader = shaderSphereMenu.value;
        uniforms[2] = shader;
        console.log(uniforms[2]);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        requestAnimationFrame(render);
    });

    function render()
    {
        //Create a render pass in a command buffer and submit it
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
        pass.draw(4);
        pass.end();
        device.queue.submit([encoder.finish()]);
    }
    render();
}