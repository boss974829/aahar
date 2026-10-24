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

import java.io.File;

public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int REQ_PERMS = 1;
    private static final int REQ_FILE = 2;

    private WebView web;
    private ValueCallback<Uri[]> upload;
    private Uri pendingClip;

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
                .build();

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

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
        intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
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
}
