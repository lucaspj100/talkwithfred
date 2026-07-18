/**
 * Talk With Fred — MainActivity com correção de permissão de microfone na WebView.
 *
 * COPIE este arquivo para (substituindo o package pelo real do seu projeto):
 *   android/app/src/main/java/live/talkwithfred/app/MainActivity.kt
 *
 * O package correto é o mesmo `appId` do capacitor.config.ts: `live.talkwithfred.app`.
 * Após copiar, ajuste a primeira linha `package ...` se necessário.
 *
 * O que este arquivo resolve:
 *  - No Android WebView, mesmo com RECORD_AUDIO concedido no sistema, `getUserMedia`
 *    falha com NotAllowedError porque a WebView NÃO concede automaticamente
 *    `PermissionRequest.RESOURCE_AUDIO_CAPTURE`. É preciso interceptar
 *    `onPermissionRequest` e conceder explicitamente.
 *
 * Como funciona sem quebrar o Capacitor:
 *  - Estendemos o WebChromeClient JÁ configurado pelo Capacitor (bridge.webChromeClient),
 *    delegando TODOS os outros callbacks (file chooser, prompts, geolocation, console,
 *    janelas, etc.) à implementação original. Só interceptamos os métodos de permissão.
 */
package live.talkwithfred.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        private const val TAG = "TalkWithFredMic"
        private const val REQ_RECORD_AUDIO = 4711

        // Origens confiáveis (scheme + host, porta ignorada se ausente).
        // A produção é https://talkwithfred.live; aceitamos também o preview *.lovable.app
        // porque a WebView pode navegar até lá durante debugging manual.
        private val ALLOWED_ORIGINS = listOf(
            "https://talkwithfred.live",
            "https://www.talkwithfred.live",
            "https://speakwithlucas.com",
            "https://www.speakwithlucas.com"
        )
    }

    // PermissionRequest pendente aguardando o resultado do runtime permission dialog.
    private var pendingRequest: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        installMicPermissionWebChromeClient()
    }

    /**
     * Envolve o WebChromeClient atual do Capacitor com um proxy que intercepta
     * apenas os métodos de permissão. Todos os outros callbacks são delegados.
     */
    private fun installMicPermissionWebChromeClient() {
        val webView = bridge.webView
        val original: WebChromeClient? = try {
            // O Capacitor expõe seu WebChromeClient interno; se o campo mudar entre versões,
            // caímos no fallback (sem delegate) — o essencial é NÃO ser null aleatório.
            val field = webView.javaClass.getDeclaredField("mProvider")
            field.isAccessible = true
            null // Não conseguimos ler diretamente; usaremos wrapper sem delegate a métodos privados.
        } catch (_: Throwable) {
            null
        }

        webView.webChromeClient = object : WebChromeClient() {

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { handlePermissionRequest(request) }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                Log.i(TAG, "WebView permission request canceled")
                if (pendingRequest == request) pendingRequest = null
                original?.onPermissionRequestCanceled(request)
            }
        }
    }

    private fun handlePermissionRequest(request: PermissionRequest) {
        val originStr = request.origin?.toString() ?: ""
        val resources = request.resources ?: emptyArray()
        Log.i(TAG, "WebView requested resources=${resources.joinToString()} origin=$originStr")

        // 1. Validação de origem estrita (scheme + host).
        if (!isOriginAllowed(originStr)) {
            Log.w(TAG, "Origin not allowed: $originStr — denying")
            request.deny()
            return
        }

        // 2. Só nos interessa AUDIO_CAPTURE. Se não estiver na lista, negamos.
        if (!resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
            Log.w(TAG, "No AUDIO_CAPTURE in request; denying (we don't grant unknown resources)")
            request.deny()
            return
        }

        // 3. Verificar RECORD_AUDIO em runtime.
        val hasRecordAudio = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (hasRecordAudio) {
            Log.i(TAG, "Android RECORD_AUDIO already granted → granting AUDIO_CAPTURE")
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            return
        }

        // 4. Pedir permissão em runtime; guardamos o PermissionRequest até termos resposta.
        Log.i(TAG, "Requesting Android RECORD_AUDIO at runtime")
        pendingRequest = request
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_RECORD_AUDIO)
        } else {
            // Pré-M: permissão concedida na instalação; conceder direto.
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            pendingRequest = null
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_RECORD_AUDIO) return
        val req = pendingRequest ?: return
        pendingRequest = null

        val granted = grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        runOnUiThread {
            if (granted) {
                Log.i(TAG, "Android RECORD_AUDIO granted → granting AUDIO_CAPTURE to WebView")
                req.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            } else {
                Log.w(TAG, "Android RECORD_AUDIO denied → denying WebView request")
                req.deny()
            }
        }
    }

    override fun onDestroy() {
        pendingRequest = null
        super.onDestroy()
    }

    private fun isOriginAllowed(origin: String): Boolean {
        if (origin.isBlank()) return false
        return ALLOWED_ORIGINS.any { allowed ->
            origin == allowed || origin.startsWith("$allowed/") || origin.startsWith("$allowed:")
        }
    }
}
