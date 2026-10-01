package com.rtc.worddictation;

import android.content.ClipData;
import android.content.Intent;
import android.app.PendingIntent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.content.SharedPreferences;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.*;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;
    private static final String DIAG_PREFS = "word_dictation_updater";
    private void diag(String stage, String detail) {
        getContext().getSharedPreferences(DIAG_PREFS, 0).edit()
                .putString("stage", stage)
                .putString("detail", detail == null ? "" : detail)
                .putLong("time", System.currentTimeMillis())
                .apply();
    }

    @PluginMethod
    public void getUpdateDiagnostics(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(DIAG_PREFS, 0);
        JSObject out = new JSObject();
        out.put("stage", p.getString("stage", ""));
        out.put("detail", p.getString("detail", ""));
        out.put("time", p.getLong("time", 0));
        call.resolve(out);
    }

    private File pendingApk() {
        File dir = new File(getContext().getFilesDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "word-dictation-update.apk");
    }

    private boolean hasValidPendingApk() {
        File apk = pendingApk();
        if (!apk.isFile()) return false;
        try {
            diag("retry_validate", "验证已下载 APK");
            validateApk(apk, "");
            return true;
        } catch (Exception e) {
            apk.delete();
            return false;
        }
    }

    @PluginMethod
    public void getPendingUpdate(PluginCall call) {
        JSObject out = new JSObject();
        out.put("pending", hasValidPendingApk());
        call.resolve(out);
    }

    @PluginMethod
    public void installPending(PluginCall call) {
        File apk = pendingApk();
        try {
            validateApk(apk, "");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                JSObject out = new JSObject();
                out.put("pending", true);
                out.put("needsPermission", true);
                call.resolve(out);
                return;
            }
            diag("retry_install", "重新提交系统安装");
            installWithPackageInstaller(apk);
            JSObject out = new JSObject();
            out.put("pending", true);
            out.put("installer", "PackageInstaller.Session");
            call.resolve(out);
        } catch (Exception e) {
            diag("retry_failed", e.getMessage());
            call.reject("继续安装失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        if (downloading) { call.reject("更新正在下载"); return; }
        String url = call.getString("url");
        String expectedDigest = call.getString("digest", "");
        if (url == null || !url.startsWith("https://github.com/RT-C-6668882025/word-dictation/")) {
            call.reject("不允许的更新地址"); return;
        }
        downloading = true;
        diag("start", "开始更新");
        worker.execute(() -> {
            File apk = pendingApk();
            Exception last = null;
            String[] urls = {url, "https://ghfast.top/" + url, "https://ghproxy.net/" + url, "https://githubproxy.cc/" + url};
            try {
                boolean ok = false;
                if (apk.isFile()) {
                    try {
                        diag("cached_validate", "发现本地待安装 APK");
                        validateApk(apk, expectedDigest);
                        diag("cached_ready", "复用已下载 APK");
                        emit("已下载，准备安装", 100, "");
                        ok = true;
                    } catch (Exception ignored) {
                        apk.delete();
                    }
                }
                if (!ok) {
                    for (String candidate : urls) {
                        try {
                            if (apk.exists()) apk.delete();
                            diag("download", sourceName(candidate));
                            emit("正在下载", 0, sourceName(candidate));
                            download(candidate, apk);
                            diag("validate", sourceName(candidate));
                            validateApk(apk, expectedDigest);
                            diag("ready", sourceName(candidate));
                            ok = true; break;
                        } catch (Exception e) {
                            last = e;
                            diag("source_failed", sourceName(candidate) + " · " + e.getMessage());
                            emit("切换下载源", 0, sourceName(candidate));
                        }
                    }
                }
                if (!ok) throw (last != null ? last : new Exception("全部下载源不可用"));
                emit("准备安装", 100, "");
                getActivity().runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                            diag("permission", "等待允许安装未知应用");
                            getActivity().startActivity(settings);
                            JSObject out = new JSObject();
                            out.put("downloaded", true);
                            out.put("pending", true);
                            out.put("needsPermission", true);
                            call.resolve(out);
                            return;
                        }
                        diag("session", "提交 PackageInstaller.Session");
                        installWithPackageInstaller(apk);
                        diag("system_confirm", "等待系统安装确认");
                        JSObject out = new JSObject();
                        out.put("downloaded", true);
                        out.put("installer", "PackageInstaller.Session");
                        out.put("pending", true);
                        call.resolve(out);
                    } catch (Exception e) { diag("install_launch_failed", e.getMessage()); call.reject("启动安装失败：" + e.getMessage()); }
                });
            } catch (Exception e) { diag("update_failed", e.getMessage()); call.reject("更新下载失败：" + e.getMessage()); }
            finally { downloading = false; }
        });
    }

    private void installWithPackageInstaller(File apk) throws Exception {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        }
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = null;
        try {
            session = installer.openSession(sessionId);
            try (InputStream in = new BufferedInputStream(new FileInputStream(apk));
                 OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buffer = new byte[128 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                session.fsync(out);
            }

            Intent result = new Intent(getContext(), InstallResultActivity.class);
            result.setAction("com.rtc.worddictation.INSTALL_RESULT");
            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) pendingFlags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getActivity(
                    getContext(), sessionId, result, pendingFlags
            );
            session.commit(pending.getIntentSender());
        } catch (Exception e) {
            try { installer.abandonSession(sessionId); } catch (Exception ignored) {}
            throw e;
        } finally {
            if (session != null) session.close();
        }
    }

    private void validateApk(File apk, String expectedDigest) throws Exception {
        if (!apk.isFile() || apk.length() < 20L * 1024 * 1024) throw new Exception("APK 文件不完整");

        if (expectedDigest != null && expectedDigest.startsWith("sha256:")) {
            String expected = expectedDigest.substring(7).trim().toLowerCase();
            String actual = sha256(apk);
            if (!actual.equals(expected)) throw new Exception("APK 校验失败");
        }

        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        PackageInfo info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (info == null) throw new Exception("APK 无法解析");
        if (!getContext().getPackageName().equals(info.packageName)) throw new Exception("APK 包名异常");

        long incoming = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        PackageInfo currentInfo = pm.getPackageInfo(getContext().getPackageName(), 0);
        long current = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? currentInfo.getLongVersionCode() : currentInfo.versionCode;
        if (incoming <= current) throw new Exception("下载到的不是新版本");

        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) throw new Exception("APK 缺少签名");
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        boolean signerOk = false;
        if (signatures != null) {
            for (Signature signature : signatures) {
                String digest = hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()));
                if ("b85efa80fe3ff6294bc5f00d572b5ecc0bf0d2ac98e3175d2acb136a9929e156".equals(digest)) {
                    signerOk = true;
                    break;
                }
            }
        }
        if (!signerOk) throw new Exception("APK 签名不匹配");
    }

    private String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buf = new byte[128 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    private String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format("%02x", b & 0xff));
        return out.toString();
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
