"use strict";
window.onload = function () { main(); }
async function main()
{
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("gpupresent") || canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
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
            targets: [{ format: canvasFormat },
                      { format: "rgba32float"}]
        },
        primitive: {
            topology: "triangle-strip",
        },
    });

    let textures = new Object();
    textures.width = canvas.width;
    textures.height = canvas.height;
    textures.renderSrc = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    format: 'rgba32float',
    });
    textures.renderDst = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    format: 'rgba32float',
    });

    var obj_filename = "../Objects/CornellBox.obj";
    var g_drawingInfo = null;

    g_drawingInfo = await readOBJFile(obj_filename, 1, true);

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
        for (let i = 0; i < g_drawingInfo.materials.length; i++) {i
            matColors.push(g_drawingInfo.materials[i].color.r);
            matColors.push(g_drawingInfo.materials[i].color.g);
            matColors.push(g_drawingInfo.materials[i].color.b);
            matColors.push(g_drawingInfo.materials[i].color.a);
            matColors.push(g_drawingInfo.materials[i].emission.r);
            matColors.push(g_drawingInfo.materials[i].emission.g);
            matColors.push(g_drawingInfo.materials[i].emission.b);
            matColors.push(g_drawingInfo.materials[i].emission.a);
        }

        buffers.color = device.createBuffer({
            size: g_drawingInfo.materials.length * 32.0, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.color, 0, new Float32Array(matColors));

        buffers.light_indices = device.createBuffer({
            size: g_drawingInfo.light_indices.byteLength, // number of bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffers.light_indices, 0, g_drawingInfo.light_indices);


        build_bsp_tree(g_drawingInfo, device, buffers);

        bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
            {binding: 0, resource: {buffer : uniformBuffer}},
            {binding: 1, resource: {buffer : uniformUIBuffer}},
            {binding: 2, resource: {buffer : buffers.aabb}},
            {binding: 3, resource: {buffer : buffers.attribs}},
            {binding: 4, resource: {buffer : buffers.indices}},
            {binding: 5, resource: {buffer : buffers.color}},
            {binding: 6, resource: {buffer : buffers.light_indices}},
            {binding: 7, resource: {buffer : buffers.treeIds}},
            {binding: 8, resource: {buffer : buffers.bspTree}},
            {binding: 9, resource: {buffer : buffers.bspPlanes}},
            {binding: 11, resource: textures.renderDst.createView()},
            ],
        });

        return bindGroup;
    }


    const uniformBuffer = device.createBuffer({
        size: 20, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uniformUIBuffer = device.createBuffer({
        size: 12, // number of bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const aspect = canvas.width/canvas.height;
    var cam_const = 1;
    var uniforms = new Float32Array([aspect, cam_const]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    var frame = 0;
    var uniformsUI = new Float32Array([canvas.width, canvas.height, frame]);
    device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);

    var progressing = true;
    var progressiveButton = document.getElementById("Progressive");
    progressiveButton.addEventListener("click", function()
    {
        if (progressing === true) 
        {
            progressing = false;
        }
        else
        {
            progressing = true;
            animate();
        }
    });

    bindGroup = onReadComplete(device, pipeline);

    function animate()
    {
        render()
        if (progressing) 
        {
            frame++;
            uniformsUI = new Uint32Array([canvas.width, canvas.height, frame]);
            device.queue.writeBuffer(uniformUIBuffer, 0, uniformsUI);
            console.log("progressive rendering");
            requestAnimationFrame(animate);
        }  
    }
    animate();

    function render()
    {
        // console.log(frame);
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store"},
                {view: textures.renderSrc.createView(), loadOp: frame === 0 ? "clear" : "load", storeOp: "store"}]
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup); 
        pass.draw(4);
        pass.end();
        encoder.copyTextureToTexture({ texture: textures.renderSrc }, { texture: textures.renderDst }, [textures.width, textures.height]);
        device.queue.submit([encoder.finish()]);
    }
    // render();
}