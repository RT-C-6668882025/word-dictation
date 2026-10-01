package com.rtc.worddictation;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        if (downloading) { call.reject("更新正在下载"); return; }
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://github.com/RT-C-6668882025/word-dictation/")) {
            call.reject("不允许的更新地址"); return;
        }
        downloading = true;
        worker.execute(() -> {
            File apk = new File(getContext().getCacheDir(), "word-dictation-update.apk");
            Exception last = null;
            String[] urls = {"https://ghfast.top/" + url, "https://ghproxy.net/" + url, url, "https://githubproxy.cc/" + url};
            try {
                boolean ok = false;
                for (String candidate : urls) {
                    try {
                        if (apk.exists()) apk.delete();
                        emit("正在下载", 0, sourceName(candidate));
                        download(candidate, apk);
                        if (apk.length() < 20L * 1024 * 1024) throw new Exception("APK 文件异常");
                        ok = true; break;
                    } catch (Exception e) {
                        last = e;
                        emit("切换下载源", 0, sourceName(candidate));
                    }
                }
                if (!ok) throw (last != null ? last : new Exception("全部下载源不可用"));
                emit("准备安装", 100, "");
                getActivity().runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                            getActivity().startActivity(settings);
                            call.reject("首次使用请允许“安装未知应用”，返回后再点一次更新");
                            return;
                        }
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updater", apk);
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(intent);
                        JSObject out = new JSObject(); out.put("downloaded", true); call.resolve(out);
                    } catch (Exception e) { call.reject("启动安装失败：" + e.getMessage()); }
                });
            } catch (Exception e) { call.reject("更新下载失败：" + e.getMessage()); }
            finally { downloading = false; }
        });
    }

    private void download(String address, File dest) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setInstanceFollowRedirects(true); c.setConnectTimeout(12000); c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "Word-Dictation-Updater/0.4.4");
        c.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
        c.connect();
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) { c.disconnect(); throw new Exception("HTTP " + code); }
        long total = c.getContentLengthLong(), done = 0; int lastProgress = -1;
        try (InputStream in = new BufferedInputStream(c.getInputStream()); BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(dest))) {
            byte[] buf = new byte[128 * 1024]; int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n); done += n;
                int progress = total > 0 ? (int)Math.min(99, done * 100 / total) : 0;
                if (progress != lastProgress) { lastProgress = progress; emit("正在下载", progress, sourceName(address)); }
            }
        } finally { c.disconnect(); }
    }

    private void emit(String state, int progress, String source) {
        JSObject p = new JSObject(); p.put("state", state); p.put("progress", progress); p.put("source", source);
        notifyListeners("updateProgress", p);
    }
    private String sourceName(String url) {
        if (url.startsWith("https://ghfast.top/")) return "GHFast";
        if (url.startsWith("https://ghproxy.net/")) return "GHProxy.net";
        if (url.startsWith("https://githubproxy.cc/")) return "GitHubProxy.cc";
        return "GitHub";
    }
    @Override protected void handleOnDestroy() { worker.shutdownNow(); super.handleOnDestroy(); }
}
