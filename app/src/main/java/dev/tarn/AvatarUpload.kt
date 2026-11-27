package dev.tarn

import android.content.Context
import java.io.DataInputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Short-lived upload page served directly by the TV to a phone on the same
 * Wi-Fi/LAN. It has a long random, single-use URL and never uploads to cloud.
 *
 * No public endpoint is left running after success, Back or Activity destroy.
 */
internal class AvatarUpload(
    context: Context,
    profileId: String,
    private val received: (String) -> Unit
) : AutoCloseable {
    private val app = context.applicationContext
    private val id = profileId
    private val host = lanAddress() ?: error("No local network address")
    private val server = ServerSocket(0, 2, InetAddress.getByName(host))
    private val completed = AtomicBoolean(false)
    private val path = "/avatar/" + (1..24).map { ALPHABET[RANDOM.nextInt(ALPHABET.length)] }.joinToString("")
    val url = "http://$host:${server.localPort}$path"

    init {
        Thread({
            while (!server.isClosed) {
                val client = runCatching { server.accept() }.getOrNull() ?: break
                runCatching { client.use { answer(it) } }
            }
        }, "tarn-avatar-upload").apply { isDaemon = true }.start()
    }

    override fun close() {
        completed.set(true)
        runCatching { server.close() }
    }

    private fun answer(socket: Socket) {
        socket.soTimeout = 12_000
        val input = socket.getInputStream()
        val head = readHead(input) ?: return
        val request = head.lineSequence().firstOrNull()?.split(' ') ?: return
        val method = request.getOrNull(0)
        val target = request.getOrNull(1)
        if (target != path || completed.get()) {
            respond(socket, 404, "Not found")
            return
        }

        when (method) {
            "GET" -> respond(socket, 200, page(), type = "text/html; charset=utf-8")
            "POST" -> {
                val length = Regex("(?im)^content-length:\\s*(\\d+)").find(head)
                    ?.groupValues?.get(1)?.toIntOrNull() ?: -1
                val type = Regex("(?im)^content-type:\\s*([^\\r\\n]+)").find(head)
                    ?.groupValues?.get(1)?.lowercase()?.trim()
                if (length !in 1..MAX_BODY || type != "image/jpeg") {
                    respond(socket, 413, "Upload a JPG photo smaller than 3 MB")
                    return
                }
                val bytes = ByteArray(length)
                DataInputStream(input).readFully(bytes)
                if (server.isClosed || completed.get()) return
                // Check image signatures before decoding and writing any file.
                if (bytes.size < 3 || bytes[0] != 0xFF.toByte() ||
                    bytes[1] != 0xD8.toByte() || bytes[2] != 0xFF.toByte()) {
                    respond(socket, 415, "Invalid image")
                    return
                }
                val localUrl = LocalProfileAvatars.save(app, id, bytes)
                if (localUrl == null) {
                    respond(socket, 422, "Could not process this photo")
                    return
                }
                if (completed.compareAndSet(false, true)) {
                    // Once saved, update the TV even if the phone closes its
                    // connection before it can read our success response.
                    runCatching { respond(socket, 200, "Photo received. You can return to your TV.") }
                    try { received(localUrl) }
                    finally { runCatching { server.close() } }
                } else respond(socket, 410, "Upload expired")
            }
            else -> respond(socket, 405, "Method not allowed")
        }
    }

    private fun respond(socket: Socket, code: Int, message: String, type: String = "text/plain; charset=utf-8") {
        val data = message.toByteArray(Charsets.UTF_8)
        val reason = when (code) {
            200 -> "OK"
            404 -> "Not Found"
            405 -> "Method Not Allowed"
            410 -> "Gone"
            413 -> "Payload Too Large"
            415 -> "Unsupported Media Type"
            else -> "Unprocessable Entity"
        }
        socket.getOutputStream().apply {
            write(("HTTP/1.1 $code $reason\r\nContent-Type: $type\r\n" +
                "Content-Length: ${data.size}\r\nCache-Control: no-store\r\n" +
                "X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n" +
                "Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; " +
                "style-src 'unsafe-inline'; img-src blob: data:; connect-src 'self'\r\n" +
                "Connection: close\r\n\r\n").toByteArray(Charsets.UTF_8))
            write(data)
            flush()
        }
    }

    private fun readHead(input: InputStream): String? {
        val header = StringBuilder()
        while (header.length < MAX_HEAD) {
            val b = input.read()
            if (b < 0) return null
            header.append(b.toChar())
            if (header.endsWith("\r\n\r\n")) return header.toString()
        }
        return null
    }

    private fun page(): String {
        val title = "Upload a profile photo"
        return """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#000;color:#f4f1ed;font:16px/1.5 system-ui,-apple-system,sans-serif;display:grid;place-items:center;padding:24px}
main{max-width:430px;width:100%}
h1{font-size:27px;margin:0 0 8px}
p{color:#bbb;margin:8px 0 24px}
input{display:block;width:100%;font-size:16px;color:#eee;margin:14px 0}
#preview{display:none;width:140px;height:140px;border-radius:50%;object-fit:cover;margin:22px auto;background:#202020}
button{width:100%;border:0;background:#f2eee8;color:#111;padding:15px;border-radius:26px;font-size:16px;font-weight:700;margin-top:16px}
button:disabled{opacity:.45}
#status{min-height:28px;color:#d4d4d4;margin-top:16px}
small{color:#aaa}
</style>
</head>
<body><main>
<h1>$title</h1>
<p>Choose a photo from your phone, then send it directly to your TV over your home Wi-Fi.</p>
<label for="photo">Your picture</label>
<input id="photo" type="file" accept="image/*">
<img id="preview" alt="Photo preview">
<button id="upload" disabled>Use this photo</button>
<div id="status" role="status" aria-live="polite"></div>
<small>Your picture stays on the TV. The upload link closes after one photo.</small>
<script>
const input=document.getElementById('photo');
const preview=document.getElementById('preview');
const button=document.getElementById('upload');
const status=document.getElementById('status');
let oldUrl;
input.addEventListener('change',()=>{
  if(oldUrl)URL.revokeObjectURL(oldUrl);
  const file=input.files&&input.files[0];
  button.disabled=!file;
  preview.style.display=file?'block':'none';
  if(file){oldUrl=URL.createObjectURL(file);preview.src=oldUrl;}
  status.textContent='';
});
function resize(file){
  return new Promise((resolve,reject)=>{
    const photo=new Image();
    const url=URL.createObjectURL(file);
    photo.onload=()=>{
      try{
        const canvas=document.createElement('canvas');
        const n=512;canvas.width=n;canvas.height=n;
        const ctx=canvas.getContext('2d');
        const side=Math.min(photo.naturalWidth,photo.naturalHeight);
        ctx.fillStyle='#202020';ctx.fillRect(0,0,n,n);
        ctx.drawImage(photo,(photo.naturalWidth-side)/2,(photo.naturalHeight-side)/2,side,side,0,0,n,n);
        canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not convert photo')),'image/jpeg',.9);
      }catch(e){reject(e);}
      URL.revokeObjectURL(url);
    };
    photo.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Photo format not supported by this browser'));};
    photo.src=url;
  });
}
button.addEventListener('click',async()=>{
  const file=input.files&&input.files[0];
  if(!file)return;
  button.disabled=true;status.textContent='Preparing photo…';
  try{
    const jpg=await resize(file);
    status.textContent='Sending to TV…';
    const response=await fetch(location.pathname,{
      method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpg,cache:'no-store'
    });
    const answer=await response.text();
    if(!response.ok)throw Error(answer||'Upload failed');
    status.textContent='✓ Photo saved! You can return to your TV.';
    input.disabled=true;
  }catch(e){
    status.textContent=e.message||'Could not send the photo. Check that your phone is on the same Wi-Fi.';
    button.disabled=false;
  }
});
</script>
</main></body></html>
""".trimIndent()
    }

    private companion object {
        const val MAX_BODY = 3 * 1024 * 1024
        const val MAX_HEAD = 8192
        const val ALPHABET = "abcdefghjkmnpqrstuvwyz23456789"
        val RANDOM = SecureRandom()
    }
}
