"use strict";
window.onload = () => { main(); };
async function main()
{
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

    var obj_filename = "CornellBoxWithBlocks.obj";
    var drawingInfo = null;

    drawingInfo = await readOBJFile(obj_filename, 1, true);

    var bindGroup;
    function onReadComplete(device, pipeline)
    {

        var buffers = {
            attribs: null,
            color: null,
            colors: null,
            indices: null,
            light_indices: null,
            treeIds: null,
            bspTree: null,
            bspPlanes: null,
            aabb: null,
        }

        var matColors = [];
        for (let i = 0; i < drawingInfo.materials.length; i++) {i
            matColors.push(drawingInfo.materials[i].color.r + drawingInfo.materials[i].emission.r);
            matColors.push(drawingInfo.materials[i].color.g + drawingInfo.materials[i].emission.g);
            matColors.push(drawingInfo.materials[i].color.b + drawingInfo.materials[i].emission.b);
            matColors.push(drawingInfo.materials[i].color.a + drawingInfo.materials[i].emission.a);
        }

        buffers.color = device.createBuffer({
            size: drawingInfo.materials.length * 16.0, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        buffers.light_indices = device.createBuffer({
            size: drawingInfo.light_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.light_indices, 0, drawingInfo.light_indices);


        build_bsp_tree(drawingInfo, device, buffers);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer}},
            {binding: 1, resource: {buffer : buffers.aabb}},
            {binding: 2, resource: {buffer : buffers.attribs}},
            {binding: 3, resource: {buffer : buffers.indices}},
            {binding: 4, resource: {buffer : buffers.color}},
            {binding: 5, resource: {buffer : buffers.light_indices}},
            {binding: 6, resource: {buffer : buffers.treeIds}},
            {binding: 7, resource: {buffer : buffers.bspTree}},
            {binding: 8, resource: {buffer : buffers.bspPlanes}},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 1;
    var uniforms = new Float32Array([aspect, cam_const]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);


    function animate()
    {
        bindGroup = onReadComplete(device, pipeline);
        render()
    }
    animate();

    function render()
    {
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
}