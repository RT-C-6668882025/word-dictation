package com.rtc.worddictation;

import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.content.SharedPreferences;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PocketTtsPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        SharedPreferences migration = getSharedPreferences("native_page_cache", 0);
        if (!migration.getBoolean("v421", false)) {
            // HTTP resources only; localStorage and native Preferences are untouched.
            webView.clearCache(true);
            migration.edit().putBoolean("v421", true).apply();
        }
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!url.startsWith(getBridge().getServerUrl())) return;
                try (InputStream in = getAssets().open("clear-web-cache.js")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    String script = new String(out.toByteArray(), StandardCharsets.UTF_8);
                    view.evaluateJavascript(script, null);
                } catch (Exception e) {
                    android.util.Log.e("WordDictation", "Page cache migration failed", e);
                }
            }
        });
    }
}
