package com.aditya.aahar;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int REQ_PERMS = 1;
    private static final int REQ_FILE = 2;
    private static final int REQ_SPEECH = 3;
    private static final int REQ_FILM = 4;

    private WebView web;
    private SpeechBridge speech;
    private ValueCallback<Uri[]> upload;
    private Uri pendingClip;
    private boolean filmAfterPerm;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!captureGranted()) {
            requestPermissions(new String[] {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
        }
        boot();
    }

    private void boot() {
        if (web != null) return;

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/clips/", this::serveClip)
                .build();

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        speech = new SpeechBridge(this, web);
        web.addJavascriptInterface(speech, "AaharSpeech");
        web.addJavascriptInterface(new FilmBridge(), "AaharFilm");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (captureGranted()) request.grant(request.getResources());
                else request.deny();
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (upload != null) upload.onReceiveValue(null);
                upload = callback;
                launchChooser(params.isCaptureEnabled());
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
        });
        web.loadUrl(START);
        setContentView(web);
    }

    private File clipFile() {
        File dir = new File(getCacheDir(), "clips");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "meal.mp4");
    }

    private WebResourceResponse serveClip(String path) {
        String name = path == null ? "" : path;
        int query = name.indexOf('?');
        if (query >= 0) name = name.substring(0, query);
        if (!"meal.mp4".equals(new File(name).getName())) return null;
        File file = clipFile();
        if (!file.isFile() || file.length() < 1000) return null;
        try {
            WebResourceResponse response = new WebResourceResponse("video/mp4", null, new FileInputStream(file));
            java.util.Map<String, String> headers = new java.util.HashMap<>();
            headers.put("Cache-Control", "no-store");
            response.setResponseHeaders(headers);
            return response;
        } catch (FileNotFoundException ex) {
            return null;
        }
    }

    private void tellFilm(String message) {
        if (web == null) return;
        String quoted = JSONObject.quote(message == null ? "" : message);
        web.post(() -> web.evaluateJavascript("window.__aaharFilmError && window.__aaharFilmError(" + quoted + ")", null));
    }

    private void tellFilmed(long bytes) {
        if (web == null) return;
        web.post(() -> web.evaluateJavascript("window.__aaharFilmed && window.__aaharFilmed(" + bytes + ")", null));
    }

    private void launchFilm() {
        File out = clipFile();
        if (out.exists() && !out.delete()) {
            tellFilm("The camera couldn't start. Try again.");
            return;
        }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", out);
        pendingClip = uri;
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
        intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 12);
        intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0);
        intent.putExtra(MediaStore.EXTRA_SIZE_LIMIT, 8L * 1024 * 1024);
        intent.setClipData(ClipData.newRawUri("meal", uri));
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        intent.addFlags(flags);
        int match = Build.VERSION.SDK_INT >= 23 ? PackageManager.MATCH_ALL : PackageManager.MATCH_DEFAULT_ONLY;
        for (ResolveInfo info : getPackageManager().queryIntentActivities(intent, match)) {
            grantUriPermission(info.activityInfo.packageName, uri, flags);
        }
        try {
            startActivityForResult(intent, REQ_FILM);
        } catch (ActivityNotFoundException ex) {
            pendingClip = null;
            tellFilm("This phone has no camera app.");
        }
    }

    private boolean copyInto(Uri source, File dest) {
        try (InputStream in = getContentResolver().openInputStream(source);
             OutputStream out = new FileOutputStream(dest)) {
            if (in == null) return false;
            byte[] buf = new byte[16384];
            int n;
            long total = 0;
            while ((n = in.read(buf)) >= 0) {
                if (n == 0) continue;
                total += n;
                if (total > 12_000_000) return false;
                out.write(buf, 0, n);
            }
            out.flush();
        } catch (IOException ex) {
            return false;
        }
        return dest.length() >= 1000;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ_PERMS || !filmAfterPerm) return;
        filmAfterPerm = false;
        if (captureGranted()) launchFilm();
        else tellFilm("Allow the camera to film a meal.");
    }

    private void launchChooser(boolean videoCapture) {
        Intent intent = videoCapture ? cameraIntent() : chooserIntent();
        grantClip(intent);
        try {
            startActivityForResult(intent, REQ_FILE);
        } catch (ActivityNotFoundException ex) {
            if (!videoCapture) {
                finishUpload(null);
                return;
            }
            pendingClip = null;
            try {
                startActivityForResult(chooserIntent(), REQ_FILE);
            } catch (ActivityNotFoundException again) {
                finishUpload(null);
            }
        }
    }

    private void grantClip(Intent intent) {
        if (pendingClip == null) return;
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        for (ResolveInfo info : getPackageManager().queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)) {
            grantUriPermission(info.activityInfo.packageName, pendingClip, flags);
        }
    }

    private Intent cameraIntent() {
        File dir = new File(getCacheDir(), "clips");
        if (!dir.exists() && !dir.mkdirs()) return chooserIntent();
        File out = new File(dir, "meal.mp4");
        if (out.exists() && !out.delete()) return chooserIntent();
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", out);
        pendingClip = uri;
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
        intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 12);
        intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0);
        intent.putExtra(MediaStore.EXTRA_SIZE_LIMIT, 8L * 1024 * 1024);
        intent.setClipData(ClipData.newRawUri("meal", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        return intent;
    }

    private Intent chooserIntent() {
        pendingClip = null;
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("video/*");
        return intent;
    }

    private boolean captureGranted() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void finishUpload(Uri[] uris) {
        if (upload != null) upload.onReceiveValue(uris);
        upload = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILM) {
            if (resultCode != RESULT_OK) {
                pendingClip = null;
                tellFilmed(0);
                return;
            }
            Uri returned = data != null ? data.getData() : null;
            if (returned == null && data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                returned = data.getClipData().getItemAt(0).getUri();
            }
            File dest = clipFile();
            boolean wrote = dest.length() >= 1000;
            if (!wrote && returned != null) wrote = copyInto(returned, dest);
            pendingClip = null;
            if (!wrote) tellFilm("That clip didn't come back. Film it again.");
            else tellFilmed(dest.length());
            return;
        }
        if (requestCode == REQ_SPEECH) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                java.util.ArrayList<String> list = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (list != null && !list.isEmpty() && list.get(0) != null) text = list.get(0);
            }
            if (speech != null) speech.deliver(text);
            return;
        }
        if (requestCode != REQ_FILE) return;
        Uri[] uris = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if ((uris == null || uris.length == 0) && resultCode == RESULT_OK && data != null && data.getData() != null) {
            uris = new Uri[] {data.getData()};
        }
        if ((uris == null || uris.length == 0) && resultCode == RESULT_OK && pendingClip != null) {
            uris = new Uri[] {pendingClip};
        }
        pendingClip = null;
        finishUpload(resultCode == RESULT_OK ? uris : null);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    public class FilmBridge {
        @JavascriptInterface
        public void film() {
            runOnUiThread(() -> {
                if (!captureGranted()) {
                    filmAfterPerm = true;
                    requestPermissions(new String[] {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
                    return;
                }
                launchFilm();
            });
        }
    }
}

class SpeechBridge {
    private final Activity activity;
    private final WebView web;
    private SpeechRecognizer recognizer;
    private boolean heard;
    private int session;

    SpeechBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    @JavascriptInterface
    public void listen(String lang) {
        activity.runOnUiThread(() -> {
            heard = false;
            String code = lang != null && lang.startsWith("hi") ? "hi-IN" : "en-IN";
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, code);
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say what you ate");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            try {
                activity.startActivityForResult(intent, 3);
            } catch (ActivityNotFoundException ex) {
                start(code);
            }
        });
    }

    @JavascriptInterface
    public void stop() {
        activity.runOnUiThread(() -> {
            if (recognizer != null) finish("");
        });
    }

    public void deliver(String text) {
        activity.runOnUiThread(() -> finish(text));
    }

    private void start(String lang) {
        halt();
        heard = false;
        final int mine = ++session;
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            finish("");
            return;
        }
        if (Build.VERSION.SDK_INT >= 23
                && activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            finish("");
            return;
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onError(int error) { if (mine == session) finish(""); }
            @Override public void onResults(Bundle results) {
                if (mine != session) return;
                java.util.ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                finish(list != null && !list.isEmpty() ? list.get(0) : "");
            }
            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.startsWith("hi") ? "hi-IN" : "en-IN");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    private void halt() {
        session += 1;
        if (recognizer == null) return;
        SpeechRecognizer old = recognizer;
        recognizer = null;
        try {
            old.cancel();
        } catch (RuntimeException ignored) {
            // already finished
        }
        old.destroy();
    }

    private void finish(String text) {
        if (heard) return;
        heard = true;
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        String quoted = JSONObject.quote(text == null ? "" : text);
        web.post(() -> web.evaluateJavascript("window.__aaharHeard && window.__aaharHeard(" + quoted + ")", null));
    }
}
