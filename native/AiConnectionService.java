package com.rtc.worddictation;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-enabled remote command session, independent of the Activity and WebView. */
public class AiConnectionService extends Service {
    public interface Observer { void event(JSONObject value); }
    public static volatile Observer observer;
    private static volatile AiConnectionService current;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile String owner, url, token;
    private volatile AtomicBoolean running = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection;
    private static final int NOTIFICATION = 18766;
    private static final String CHANNEL = "word_ai_connection";

    public static void stopOwner(String owner) {
        AiConnectionService s = current;
        if (s != null && owner.equals(s.owner)) s.stopSelf();
    }
    @Override public void onCreate() {
        super.onCreate(); current = this;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "AI 连接", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("后台接收词库指令及显示连接状态");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    private Notification notification(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent action = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("WordTok · AI 连接")
            .setContentText(text).setContentIntent(action).setOngoing(true).setOnlyAlertOnce(true).build();
    }
    private void state(String state, String text) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION, notification(text));
        JSONObject event = new JSONObject();
        try { event.put("type", "state").put("owner", owner).put("state", state).put("message", text); } catch (JSONException ignored) {}
        emit(event);
    }
    private void emit(JSONObject event) {
        main.post(() -> { Observer receiver = observer; if (receiver != null) receiver.event(event); });
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String nextOwner = intent.getStringExtra("owner"), nextUrl = intent.getStringExtra("url"), nextToken = intent.getStringExtra("token");
        if (nextOwner == null || nextUrl == null || nextToken == null || !nextUrl.startsWith("https://")) { stopSelf(); return START_NOT_STICKY; }
        if (running.get() && nextOwner.equals(owner)) return START_REDELIVER_INTENT;
        running.set(false); disconnect();
        owner = nextOwner; url = nextUrl; token = nextToken; AtomicBoolean session = new AtomicBoolean(true); running = session;
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, notification("正在连接"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTIFICATION, notification("正在连接"));
        worker.submit(() -> loop(session, nextOwner, nextUrl, nextToken)); return START_REDELIVER_INTENT;
    }
    private void sessionState(AtomicBoolean session, String value, String text) { if (running == session && session.get()) state(value, text); }
    private void loop(AtomicBoolean session, String sessionOwner, String base, String secret) {
        JSONObject outbox = null; int failures = 0;
        PowerManager.WakeLock lock = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WordDictation:AiSession");
        lock.setReferenceCounted(false);
        try { while (session.get()) {
            lock.acquire(60000);
            try {
                if (outbox != null) { request(base, secret, "/device/result", outbox); outbox = null; }
                JSONArray rows = new JSONArray(request(base, secret, "/device/poll", null));
                if (!session.get()) break;
                failures = 0; sessionState(session, "ready", "已就绪 · 切换应用后仍可接收指令");
                for (int i = 0; i < rows.length() && session.get(); i++) {
                    JSONObject row = rows.getJSONObject(i); String id = row.getString("id");
                    sessionState(session, "working", "AI 正在操作词库");
                    JSONObject transaction;
                    try { transaction = AiWordStore.execute(this, row); }
                    catch (Exception error) { transaction = new JSONObject().put("response", new JSONObject().put("error", "词库保存状态未确认，请用原指令编号查询或重试").put("data_changed", true)).put("changed", false); }
                    JSONObject response = transaction.getJSONObject("response"); response.put("id", id); outbox = response;
                    JSONObject event = new JSONObject().put("type", "completed").put("owner", sessionOwner).put("request", row).put("response", response);
                    if (transaction.optBoolean("changed")) event.put("snapshot", transaction.getJSONObject("state"));
                    emit(event);
                    request(base, secret, "/device/result", outbox); outbox = null;
                }
                // The relay currently waits one second; keep idle polling below one request per second.
                if (rows.length() == 0) Thread.sleep(4000);
            } catch (Unauthorized e) { if (!session.get()) break; sessionState(session, "revoked", "配对已失效，请打开应用处理"); session.set(false); main.post(() -> { if (running == session) stopSelf(); }); }
            catch (Exception e) {
                if (!session.get()) break;
                sessionState(session, "reconnecting", "连接中断，正在重连");
                try { Thread.sleep(Math.min(15000, 1000L << Math.min(failures++, 4))); } catch (InterruptedException interrupted) { break; }
            }
        } } finally { if (lock.isHeld()) lock.release(); }
    }
    protected String request(String base, String secret, String path, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)new URL(base + path).openConnection(); activeConnection = connection;
        try {
            connection.setConnectTimeout(5000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Authorization", "Bearer " + secret);
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json"); connection.setDoOutput(true);
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            }
            int status = connection.getResponseCode(); if (status == 401) throw new Unauthorized(); if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = in.read(buffer)) != -1) { if (out.size() + count > 4 * 1024 * 1024) throw new IOException("Response too large"); out.write(buffer, 0, count); }
                return out.toString("UTF-8");
            }
        } finally { connection.disconnect(); if (activeConnection == connection) activeConnection = null; }
    }
    private void disconnect() { HttpURLConnection connection = activeConnection; if (connection != null) connection.disconnect(); }
    @Override public void onTimeout(int startId, int foregroundServiceType) { state("reconnecting", "后台时限已到，打开应用可恢复连接"); stopSelf(); }
    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); }
    @Override public void onDestroy() {
        running.set(false); disconnect(); worker.shutdownNow();
        if (current == this) current = null;
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    private static final class Unauthorized extends IOException {}
}
