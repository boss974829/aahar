package com.aditya.aahar;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String PREFS = "aahar";
    private static final String KEY_URL = "url";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String saved = prefs().getString(KEY_URL, "");
        if (saved.startsWith("http://") || saved.startsWith("https://")) {
            showJournal(saved);
            return;
        }
        showSetup();
    }

    private void showSetup() {
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setBackgroundColor(Color.parseColor("#07140e"));
        int pad = dp(28);
        column.setPadding(pad, dp(72), pad, pad);

        TextView kicker = label("PRIVATE JOURNAL", 12, Color.parseColor("#3dce86"));
        kicker.setLetterSpacing(0.18f);
        column.addView(kicker);

        TextView title = label("Aahar", 56, Color.parseColor("#f4faf6"));
        title.setTypeface(Typeface.SERIF, Typeface.ITALIC);
        title.setPadding(0, dp(12), 0, 0);
        column.addView(title);

        TextView body = label("Paste the address of your Aahar journal. It stays on this phone.", 16, Color.parseColor("#b7cfc2"));
        body.setPadding(0, dp(16), 0, dp(28));
        column.addView(body);

        EditText input = new EditText(this);
        input.setHint("https://");
        input.setHintTextColor(Color.parseColor("#6d8f7c"));
        input.setTextColor(Color.parseColor("#f4faf6"));
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setBackgroundColor(Color.parseColor("#0e2418"));
        input.setPadding(dp(16), dp(14), dp(16), dp(14));
        column.addView(input, match());

        Button open = new Button(this);
        open.setText("Open journal");
        open.setAllCaps(false);
        open.setTextColor(Color.parseColor("#052014"));
        open.setBackgroundColor(Color.parseColor("#12c56a"));
        LinearLayout.LayoutParams buttonParams = match();
        buttonParams.topMargin = dp(16);
        column.addView(open, buttonParams);

        TextView error = label("", 14, Color.parseColor("#ff8d66"));
        error.setPadding(0, dp(16), 0, 0);
        column.addView(error);

        open.setOnClickListener(v -> {
            String url = input.getText().toString().trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                error.setText("Use a full address, starting with https://");
                return;
            }
            prefs().edit().putString(KEY_URL, url).apply();
            showJournal(url);
        });

        setContentView(column);
    }

    private void showJournal(String url) {
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#07140e"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
        web.setOnLongClickListener(v -> {
            prefs().edit().remove(KEY_URL).apply();
            web = null;
            showSetup();
            return true;
        });
        web.loadUrl(url);
        setContentView(web);
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

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private TextView label(String text, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sp);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams match() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
