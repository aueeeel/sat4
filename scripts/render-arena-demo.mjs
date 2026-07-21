import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const frameDir = join(root, "public", "arena", "demo-frames");
const outputPath = join(root, "public", "arena", "arena-demo.webm");
const port = 4320;

const frames = [
  { file: "01-hero.png", kicker: "SAT4.ME ARENA", title: "Start a private SAT race" },
  { file: "02-topic.png", kicker: "CHOOSE THE CHALLENGE", title: "Pick a full topic or one exact skill" },
  { file: "03-lobby.png", kicker: "LIVE LOBBY", title: "Friends join with one room code" },
  { file: "04-live.png", kicker: "RACE IN REAL TIME", title: "Solve faster. Score higher." },
  { file: "05-results.png", kicker: "INSTANT RESULTS", title: "See the winner and review every answer" },
];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#08182d;overflow:hidden}canvas{display:block;width:1280px;height:720px}
</style></head><body><canvas width="1280" height="720"></canvas><script>
(async()=>{const scenes=${JSON.stringify(frames)};
const canvas=document.querySelector('canvas');const ctx=canvas.getContext('2d');
const images=await Promise.all(scenes.map(scene=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='/frames/'+scene.file})));
const fps=30, sceneDuration=2400, fadeDuration=420, totalDuration=sceneDuration*scenes.length;
const stream=canvas.captureStream(fps);
const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3200000});const chunks=[];
recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
recorder.onstop=async()=>{const blob=new Blob(chunks,{type:mime});await fetch('/save',{method:'POST',headers:{'content-type':'video/webm'},body:blob});document.body.dataset.done='true'};
const roundedRect=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r)};
const drawScene=(index,localTime,alpha=1)=>{
  const image=images[index], scene=scenes[index];
  ctx.save();ctx.globalAlpha=alpha;
  const progress=Math.min(1,Math.max(0,localTime/sceneDuration));const zoom=1.012+progress*.025;
  const frameW=1160*zoom,frameH=653*zoom,frameX=(1280-frameW)/2,frameY=22+(653-frameH)/2;
  ctx.shadowColor='rgba(0,16,45,.34)';ctx.shadowBlur=38;ctx.shadowOffsetY=20;
  roundedRect(frameX,frameY,frameW,frameH,30);ctx.clip();ctx.drawImage(image,frameX,frameY,frameW,frameH);
  ctx.restore();
  ctx.save();ctx.globalAlpha=alpha;
  const gradient=ctx.createLinearGradient(0,500,0,720);gradient.addColorStop(0,'rgba(5,18,38,0)');gradient.addColorStop(.55,'rgba(5,18,38,.72)');gradient.addColorStop(1,'rgba(5,18,38,.96)');ctx.fillStyle=gradient;ctx.fillRect(0,470,1280,250);
  roundedRect(70,555,166,34,17);ctx.fillStyle=index%2?'#f26a21':'#2870c6';ctx.fill();
  ctx.fillStyle='#fff';ctx.font='700 13px Arial';ctx.letterSpacing='1px';ctx.textAlign='center';ctx.fillText(scene.kicker,153,577);
  ctx.textAlign='left';ctx.font='700 37px Arial';ctx.fillStyle='#fff';ctx.fillText(scene.title,70,636);
  ctx.font='600 14px Arial';ctx.fillStyle='rgba(255,255,255,.66)';ctx.fillText(String(index+1).padStart(2,'0')+'  /  '+String(scenes.length).padStart(2,'0'),1120,636);
  for(let step=0;step<scenes.length;step++){ctx.fillStyle=step<=index?(step%2?'#f26a21':'#58a4ee'):'rgba(255,255,255,.22)';ctx.fillRect(70+step*62,668,50,3)}
  ctx.restore();
};
let startedAt=0;recorder.start(250);
const animate=time=>{if(!startedAt)startedAt=time;const elapsed=time-startedAt;const sceneIndex=Math.min(scenes.length-1,Math.floor(elapsed/sceneDuration));const local=elapsed-sceneIndex*sceneDuration;
ctx.fillStyle='#08182d';ctx.fillRect(0,0,1280,720);drawScene(sceneIndex,local,1);
if(local>sceneDuration-fadeDuration&&sceneIndex<scenes.length-1){const fade=(local-(sceneDuration-fadeDuration))/fadeDuration;drawScene(sceneIndex+1,0,fade)}
if(elapsed<totalDuration){requestAnimationFrame(animate)}else{setTimeout(()=>recorder.stop(),120)}};requestAnimationFrame(animate);
})();</script></body></html>`;

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method === "GET" && request.url?.startsWith("/frames/")) {
    const filename = request.url.slice("/frames/".length);
    const filePath = join(frameDir, filename);
    response.writeHead(200, { "content-type": extname(filePath) === ".png" ? "image/png" : "application/octet-stream" });
    response.end(readFileSync(filePath));
    return;
  }
  if (request.method === "POST" && request.url === "/save") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      writeFileSync(outputPath, Buffer.concat(chunks));
      response.writeHead(204);
      response.end();
      process.stdout.write(`Saved ${outputPath}\n`);
      setTimeout(() => server.close(), 100);
    });
    return;
  }
  response.writeHead(404);
  response.end();
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`Arena demo renderer ready on http://127.0.0.1:${port}\n`));
setTimeout(() => {
  process.stderr.write("Arena demo renderer timed out.\n");
  server.close(() => process.exit(1));
}, 45_000).unref();
