package com.rtc.worddictation;

import android.content.ClipData;
import android.content.Context;
import android.content.pm.ResolveInfo;
import android.content.pm.ApplicationInfo;
import java.util.LinkedHashSet;
import java.util.Set;
import android.content.Intent;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;

import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
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
        String stage = p.getString("stage", "");
        if ((stage.equals("system_installer") || stage.equals("install_incomplete")) && installedTarget())
            diag("install_success", "已确认目标版本安装完成");
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
            getActivity().runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                            !getContext().getPackageManager().canRequestPackageInstalls()) {
                        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName()));
                        getActivity().startActivity(settings);
                        JSObject out = new JSObject();
                        out.put("pending", true);out.put("needsPermission", true);call.resolve(out);return;
                    }
                    diag("retry_install", "重新打开系统安装器");
                    openSystemInstaller(call, apk);
                } catch (Exception e) {
                    diag("retry_failed", e.getMessage());call.reject("继续安装失败：" + e.getMessage());
                }
            });
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
                        diag("installer", "从前台打开系统安装器");
                        openSystemInstaller(call, apk);
                    } catch (Exception e) { diag("install_launch_failed", e.getMessage()); call.reject("启动安装失败：" + e.getMessage()); }
                });
            } catch (Exception e) { diag("update_failed", e.getMessage()); call.reject("更新下载失败：" + e.getMessage()); }
            finally { downloading = false; }
        });
    }

    @SuppressWarnings("deprecation")
    static Intent systemInstallIntent(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.setClipData(ClipData.newRawUri("APK", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
        return intent;
    }

    // Some OEM installers hand parsing to another package and lose the Intent's URI grant.
    // Grant only this APK, read-only, to installer handlers and installed system delegates.
    static Set<String> grantInstallerReadAccess(Context context, Intent intent) {
        PackageManager pm = context.getPackageManager();
        Set<String> packages = new LinkedHashSet<>();
        for (String action : new String[]{Intent.ACTION_INSTALL_PACKAGE, Intent.ACTION_VIEW}) {
            Intent probe = new Intent(intent).setAction(action);
            for (ResolveInfo info : pm.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY))
                if (info.activityInfo != null) packages.add(info.activityInfo.packageName);
        }
        for (String name : new String[]{"com.miui.packageinstaller", "com.android.packageinstaller", "com.google.android.packageinstaller", "com.samsung.android.packageinstaller"}) {
            try {
                ApplicationInfo info = pm.getApplicationInfo(name, 0);
                if ((info.flags & (ApplicationInfo.FLAG_SYSTEM | ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0) packages.add(name);
            } catch (PackageManager.NameNotFoundException absent) { /* Different OEM. */ }
        }
        for (String name : packages) context.grantUriPermission(name, intent.getData(), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return packages;
    }

    private void openSystemInstaller(PluginCall call, File apk) throws Exception {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updater", apk);
        PackageInfo target = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (target == null) throw new Exception("APK 无法解析");
        long version = Build.VERSION.SDK_INT >= 28 ? target.getLongVersionCode() : target.versionCode;
        getContext().getSharedPreferences(DIAG_PREFS, 0).edit().putLong("target_version", version).apply();
        Intent intent = systemInstallIntent(uri);
        // Remove any previous explicit grant before granting the current validated APK.
        getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Set<String> installers = grantInstallerReadAccess(getContext(), intent);
        diag("system_installer", "已从前台打开系统安装器，等待系统确认；APK 已保留\n已授予 APK 只读权限：" + installers);
        try { startActivityForResult(call, intent, "systemInstallResult"); }
        catch (ActivityNotFoundException unavailable) {
            intent.setAction(Intent.ACTION_VIEW);
            startActivityForResult(call, intent, "systemInstallResult");
        }
    }

    static String resultDetail(int resultCode, Intent data) {
        String message = data == null ? null : data.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String detail = resultCode == Activity.RESULT_OK ? "系统报告安装成功"
                : "系统安装未完成（可能取消或被拦截），APK 已保留，可重试";
        detail += "\nresultCode=" + resultCode;
        if (data != null && data.hasExtra("android.intent.extra.INSTALL_RESULT"))
            detail += "\ninstallResult=" + data.getIntExtra("android.intent.extra.INSTALL_RESULT", 0);
        if (message != null && !message.isEmpty()) detail += "\n" + message;
        return detail;
    }

    private boolean installedTarget() {
        long target = getContext().getSharedPreferences(DIAG_PREFS, 0).getLong("target_version", 0);
        try {
            PackageInfo current = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long version = Build.VERSION.SDK_INT >= 28 ? current.getLongVersionCode() : current.versionCode;
            return target > 0 && version >= target;
        } catch (Exception e) { return false; }
    }

    @ActivityCallback private void systemInstallResult(PluginCall call, ActivityResult result) {
        boolean success = result.getResultCode() == Activity.RESULT_OK || installedTarget();
        String detail = resultDetail(success ? Activity.RESULT_OK : result.getResultCode(), result.getData());
        diag(success ? "install_success" : "install_incomplete", detail);
        if (call != null) {
            JSObject out = new JSObject();
            out.put("pending", !success && hasValidPendingApk());
            out.put("installed", success);
            out.put("message", detail);
            call.resolve(out);
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
