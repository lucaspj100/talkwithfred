package live.talkwithfred.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * MainActivity para Talk With Fred.
 *
 * Motivo: em WebView Android, mesmo com android.permission.RECORD_AUDIO concedida
 * no sistema, getUserMedia({audio:true}) retorna NotAllowedError até que o
 * WebChromeClient responda a onPermissionRequest concedendo
 * PermissionRequest.RESOURCE_AUDIO_CAPTURE. Esta MainActivity intercepta apenas
 * esse callback e mantém o restante do WebChromeClient padrão do Capacitor.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "TalkWithFredMic";
    private static final int REQ_RECORD_AUDIO = 4242;

    private static final Set<String> ALLOWED_ORIGINS = new HashSet<>(Arrays.asList(
            "https://talkwithfred.live",
            "https://www.talkwithfred.live",
            "https://speakwithlucas.com",
            "https://www.speakwithlucas.com"
    ));

    private PermissionRequest pendingRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            Log.w(TAG, "WebView not available at onCreate");
            return;
        }

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handlePermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingRequest == request) {
                    pendingRequest = null;
                }
                Log.d(TAG, "Permission request canceled");
            }
        });
    }

    private void handlePermissionRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        String originStr = origin != null ? origin.toString() : "";
        // WebView entrega origem com "/" no final; normalizamos.
        String normalized = originStr.endsWith("/")
                ? originStr.substring(0, originStr.length() - 1)
                : originStr;

        if (!ALLOWED_ORIGINS.contains(normalized)) {
            Log.w(TAG, "Origin not allowed: " + normalized);
            request.deny();
            return;
        }

        boolean wantsAudio = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                wantsAudio = true;
                break;
            }
        }
        if (!wantsAudio) {
            Log.d(TAG, "No audio in request, denying");
            request.deny();
            return;
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "RECORD_AUDIO already granted, granting AUDIO_CAPTURE");
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            return;
        }

        // Precisa pedir em runtime
        pendingRequest = request;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_RECORD_AUDIO);
        } else {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_RECORD_AUDIO) return;

        final PermissionRequest req = pendingRequest;
        pendingRequest = null;
        if (req == null) return;

        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        runOnUiThread(() -> {
            if (granted) {
                Log.d(TAG, "Runtime RECORD_AUDIO granted");
                req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                Log.d(TAG, "Runtime RECORD_AUDIO denied");
                req.deny();
            }
        });
    }

    @Override
    public void onDestroy() {
        pendingRequest = null;
        super.onDestroy();
    }
}
