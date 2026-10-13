package com.rtc.worddictation;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
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
    @PluginMethod public void respond(PluginCall call) {
        String id = call.getString("id"), requestOwner = call.getString("owner");
        if (id == null || requestOwner == null) { call.reject("Missing operation ID"); return; }
        AiConnectionService.respond(requestOwner, id, call.getData()); call.resolve();
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
        if (owner != null) AiConnectionService.stopOwner(owner);
        if (AiConnectionService.observer == observer) { AiConnectionService.observer = null; getContext().stopService(new Intent(getContext(), AiConnectionService.class)); }
        lastIntent = null; owner = null;
    }
}
