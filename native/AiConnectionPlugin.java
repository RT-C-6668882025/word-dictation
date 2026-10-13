package com.rtc.worddictation;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.net.Uri;
import android.provider.Settings;
import org.json.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "AiConnection", permissions = {@Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})})
public class AiConnectionPlugin extends Plugin {
    private Intent lastIntent;
    private String owner;
    private final AiConnectionService.Observer observer = event -> {
        try { notifyListeners("event", new JSObject(event.toString())); } catch (Exception ignored) {}
    };
    @PluginMethod public void start(PluginCall call) {
        String nextOwner = call.getString("owner");
        if (nextOwner == null) { call.reject("Missing owner"); return; }
        if (!nextOwner.equals(owner)) lastIntent = null;
        owner = nextOwner;
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "notificationResult"); return;
        }
        begin(call);
    }
    @PermissionCallback private void notificationResult(PluginCall call) { begin(call); }
    private void begin(PluginCall call) {
        String url = call.getString("url"), token = call.getString("token"), nextOwner = call.getString("owner");
        if (url == null || !url.startsWith("https://") || token == null || nextOwner == null) { call.reject("无效连接配置"); return; }
        if (!nextOwner.equals(owner)) { call.resolve(); return; }
        AiConnectionService.observer = observer;
        lastIntent = new Intent(getContext(), AiConnectionService.class).putExtra("url", url).putExtra("token", token).putExtra("owner", owner);
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(lastIntent); else getContext().startService(lastIntent);
            call.resolve();
        } catch (Exception e) { call.reject("后台连接启动失败，请回到应用重连", e); }
    }
    @PluginMethod public void getWordState(PluginCall call) {
        try { call.resolve(new JSObject(AiWordStore.load(getContext(), call.getString("initial")).toString())); }
        catch (Exception e) { call.reject("词库读取失败", e); }
    }
    @PluginMethod public void saveBooks(PluginCall call) {
        try { call.resolve(new JSObject(AiWordStore.saveBooks(getContext(), call.getData().optLong("revision", -1), new JSONArray(call.getString("books"))).toString())); }
        catch (Exception e) { call.reject(e.getMessage(), e); }
    }
    @PluginMethod public void backgroundStatus(PluginCall call) {
        PowerManager power = (PowerManager)getContext().getSystemService(android.content.Context.POWER_SERVICE);
        call.resolve(new JSObject().put("allowed", Build.VERSION.SDK_INT < 23 || power.isIgnoringBatteryOptimizations(getContext().getPackageName())));
    }
    @PluginMethod public void allowBackground(PluginCall call) {
        try {
            Intent settings = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings); call.resolve();
        } catch (Exception e) { call.reject("请在系统电池设置中允许本应用后台运行", e); }
    }
    @PluginMethod public void stop(PluginCall call) {
        String requestedOwner = call.getString("owner");
        if (requestedOwner != null) { AiConnectionService.stopOwner(requestedOwner); if (requestedOwner.equals(owner)) { owner = null; lastIntent = null; } }
        call.resolve();
    }
    @Override protected void handleOnResume() {
        if (lastIntent != null) {
            try { if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(lastIntent); else getContext().startService(lastIntent); }
            catch (Exception ignored) {}
        }
    }
    @Override protected void handleOnDestroy() {
        // Configuration changes / Activity recreation must not close the command session.
        if (getActivity().isFinishing() && owner != null) AiConnectionService.stopOwner(owner);
        if (AiConnectionService.observer == observer) AiConnectionService.observer = null;
        lastIntent = null; owner = null;
    }
}
