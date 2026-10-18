package com.rtc.worddictation;

import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GenerationConfig;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;
import com.k2fsa.sherpa.onnx.WaveReader;
import com.k2fsa.sherpa.onnx.WaveData;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.Locale;
import java.util.List;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "PocketTts")
public class PocketTtsPlugin extends Plugin {
    private TextToSpeech systemTts;
    private String systemTtsPackage = "";
    private boolean systemTtsReady = false;
    private int systemTtsGeneration = 0;
    private PluginCall activeSystemCall;
    private String activeUtteranceId = "";

    private static final String MODEL_NAME = "kitten-micro-en-v0_8";
    private static final String LEGACY_MODEL_NAME = "sherpa-onnx-pocket-tts-int8-2026-01-26";
    private static final String OFFICIAL_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + MODEL_NAME + ".tar.bz2";
    private static final String GHFAST_URL = "https://ghfast.top/" + OFFICIAL_URL;
    private static final String GHPROXY_NET_URL = "https://ghproxy.net/" + OFFICIAL_URL;
    private static final String GITHUBPROXY_CC_URL = "https://githubproxy.cc/" + OFFICIAL_URL;
    private static final String MODEL_SHA256 = "85faaea7511ca9d1d2f251fed0a4553bdf0d1ee046102fa60ddd8046c751f76f";
    private static final String CHINESE_MODEL_NAME = "vits-melo-tts-zh_en";
    private static final String CHINESE_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + CHINESE_MODEL_NAME + ".tar.bz2";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ThreadPoolExecutor speechWorker = new ThreadPoolExecutor(
            1, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>()
    );
    private final AtomicInteger pocketSpeakGeneration = new AtomicInteger(0);
    private volatile boolean downloading = false;
    private OfflineTts tts;
    private OfflineTts chineseTts;

    private File modelParent() {
        return new File(getContext().getFilesDir(), "voice");
    }

    private File modelDir() {
        return new File(modelParent(), MODEL_NAME);
    }
    private File chineseDir() { return new File(modelParent(), CHINESE_MODEL_NAME); }
    private boolean chineseInstalled() {
        File d = chineseDir();
        return new File(d, "model.onnx").length() > 50_000_000L
                && new File(d, "lexicon.txt").isFile()
                && new File(d, "tokens.txt").isFile();
    }

    private boolean installed() {
        File d = modelDir();
        return new File(d, "model.onnx").isFile()
                && new File(d, "voices.bin").isFile()
                && new File(d, "tokens.txt").isFile()
                && new File(d, "espeak-ng-data").isDirectory();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", installed());
        ret.put("chineseInstalled", chineseInstalled());
        ret.put("downloading", downloading);
        ret.put("model", "KittenTTS Micro v0.8");
        ret.put("downloadMB", 42);
        ret.put("diskMB", 60);
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadChineseModel(PluginCall call) {
        if (chineseInstalled()) { getStatus(call); return; }
        if (downloading) { call.reject("语音正在下载"); return; }
        downloading = true;
        worker.execute(() -> {
            File archive = new File(getContext().getCacheDir(), CHINESE_MODEL_NAME + ".tar.bz2");
            try {
                String[] urls = { "https://ghfast.top/" + CHINESE_URL, "https://ghproxy.net/" + CHINESE_URL, CHINESE_URL };
                Exception failure = null;
                boolean complete = false;
                for (String url : urls) {
                    try {
                        notifyDownloadState("正在下载中文语音", url, 1);
                        downloadResumable(url, archive);
                        if (archive.length() < 40_000_000L || archive.length() > 250_000_000L)
                            throw new Exception("模型大小异常");
                        if (!modelParent().exists() && !modelParent().mkdirs()) throw new Exception("无法创建模型目录");
                        extractTarBz2(archive, modelParent());
                        if (!chineseInstalled()) throw new Exception("模型文件不完整");
                        complete = true;
                        break;
                    } catch (Exception e) { failure = e; archive.delete(); deleteRecursive(chineseDir()); }
                }
                if (!complete) throw new Exception(failure == null ? "下载失败" : failure.getMessage());
                JSObject progress = new JSObject();
                progress.put("progress", 100);
                progress.put("chineseInstalled", true);
                notifyListeners("downloadProgress", progress);
                JSObject result = new JSObject();
                result.put("chineseInstalled", true);
                call.resolve(result);
            } catch (Exception e) { call.reject("中文语音下载失败：" + e.getMessage()); }
            finally { downloading = false; archive.delete(); }
        });
    }

    @PluginMethod
    public void deleteChineseModel(PluginCall call) {
        worker.execute(() -> {
            synchronized (this) {
                if (chineseTts != null) { chineseTts.release(); chineseTts = null; }
            }
            deleteRecursive(chineseDir());
            JSObject result = new JSObject();
            result.put("chineseInstalled", false);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (installed()) {
            getStatus(call);
            return;
        }
        if (downloading) {
            call.reject("语音正在下载");
            return;
        }
        String source = call.getString("source", "auto");
        downloading = true;
        worker.execute(() -> {
            File archive = new File(getContext().getCacheDir(), MODEL_NAME + ".tar.bz2");
            try {
                String[] urls = sourceOrder(source);
                String usedUrl = null;
                Exception lastError = null;
                for (int sourceIndex = 0; sourceIndex < urls.length; sourceIndex++) {
                    String url = urls[sourceIndex];
                    archive.delete();
                    for (int attempt = 1; attempt <= 2; attempt++) {
                        try {
                            notifyDownloadState("正在连接 " + sourceName(url), url, attempt);
                            downloadResumable(url, archive);
                            if (archive.length() != 44423643L) {
                                throw new Exception("文件大小异常：" + archive.length());
                            }
                            notifyDownloadState("正在校验模型", url, attempt);
                            String digest = sha256(archive);
                            if (!MODEL_SHA256.equalsIgnoreCase(digest)) {
                                throw new SecurityException("模型校验失败");
                            }
                            usedUrl = url;
                            lastError = null;
                            break;
                        } catch (Exception e) {
                            lastError = e;
                            if (attempt < 2) {
                                notifyDownloadState(sourceName(url) + " 失败，重试一次", url, attempt);
                                try { Thread.sleep(800L); } catch (InterruptedException ignored) {}
                            }
                        }
                    }
                    if (usedUrl != null) break;
                    if (sourceIndex < urls.length - 1) {
                        notifyDownloadState("自动切换下载源", urls[sourceIndex + 1], 0);
                    }
                }
                if (usedUrl == null) {
                    String reason = lastError == null ? "未知错误" : lastError.getMessage();
                    throw new Exception("全部下载源均失败：" + reason);
                }

                File parent = modelParent();
                if (!parent.exists() && !parent.mkdirs()) throw new Exception("无法创建模型目录");
                extractTarBz2(archive, parent);
                if (!installed()) throw new Exception("模型文件不完整");
                File legacy = new File(modelParent(), LEGACY_MODEL_NAME);
                if (legacy.exists()) deleteRecursive(legacy);
                JSObject done = new JSObject();
                done.put("progress", 100);
                done.put("installed", true);
                notifyListeners("downloadProgress", done);
                JSObject ret = new JSObject();
                ret.put("installed", true);
                ret.put("source", sourceName(usedUrl));
                call.resolve(ret);
            } catch (Exception e) {
                deleteRecursive(modelDir());
                call.reject("语音下载失败：" + e.getMessage());
            } finally {
                downloading = false;
                archive.delete();
            }
        });
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        worker.execute(() -> {
            releaseTts();
            deleteRecursive(modelDir());
            JSObject ret = new JSObject();
            ret.put("installed", false);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getSystemEngines(PluginCall call) {
        JSArray out = new JSArray();
        List<ResolveInfo> services = getContext().getPackageManager()
                .queryIntentServices(new Intent("android.intent.action.TTS_SERVICE"), 0);
        for (ResolveInfo service : services) {
            if (service.serviceInfo == null || service.serviceInfo.packageName == null) continue;
            JSObject item = new JSObject();
            item.put("id", service.serviceInfo.packageName);
            CharSequence label = service.loadLabel(getContext().getPackageManager());
            item.put("name", label == null ? service.serviceInfo.packageName : label.toString());
            out.put(item);
        }
        JSObject result = new JSObject();
        result.put("engines", out);
        call.resolve(result);
    }

    @PluginMethod
    public void speakSystem(PluginCall call) {
        String text = call.getString("text", "").trim();
        float speed = call.getFloat("speed", 1.0f);
        String requestedEngine = call.getString("engine", "").trim();
        String language = call.getString("language", "en-US");
        Locale locale = Locale.forLanguageTag(language);
        if (text.isEmpty()) { call.reject("没有可朗读的单词"); return; }
        final float safeSpeed = Math.max(0.5f, Math.min(2.0f, speed));
        getActivity().runOnUiThread(() -> {
            List<ResolveInfo> services = getContext().getPackageManager()
                    .queryIntentServices(new Intent("android.intent.action.TTS_SERVICE"), 0);
            List<String> engines = new ArrayList<>();
            for (ResolveInfo service : services) {
                if (service.serviceInfo != null && service.serviceInfo.packageName != null
                        && !engines.contains(service.serviceInfo.packageName)) {
                    engines.add(service.serviceInfo.packageName);
                }
            }
            if (engines.isEmpty()) { call.reject("系统没有可用的语音引擎"); return; }
            if (!requestedEngine.isEmpty()) {
                if (!engines.contains(requestedEngine)) {
                    call.reject("指定的语音引擎不可用");
                    return;
                }
                engines.clear();
                engines.add(requestedEngine);
            } else {
                // Empty engine means Android's actual user-selected default TTS.
                engines.clear();
                engines.add("");
            }
            speakWithPersistentSystemEngine(call, text, safeSpeed, locale, engines, 0);
        });
    }

    private void speakWithPersistentSystemEngine(PluginCall call, String text, float speed, Locale locale,
                                                  List<String> engines, int index) {
        if (index >= engines.size()) { call.reject("系统语音缺少" + locale.getDisplayLanguage(Locale.SIMPLIFIED_CHINESE) + "语音数据，请在系统设置中安装对应语言的语音包"); return; }
        String packageName = engines.get(index);

        if (systemTts != null && systemTtsReady && packageName.equals(systemTtsPackage)) {
            speakNow(call, text, speed, locale);
            return;
        }

        stopSystemSpeech();
        if (systemTts != null) {
            systemTts.shutdown();
            systemTts = null;
        }
        systemTtsReady = false;
        systemTtsPackage = packageName;
        int generation = ++systemTtsGeneration;
        final TextToSpeech[] holder = new TextToSpeech[1];
        TextToSpeech.OnInitListener listener = status -> {
            if (generation != systemTtsGeneration) {
                if (holder[0] != null) holder[0].shutdown();
                return;
            }
            systemTts = holder[0];
            if (status != TextToSpeech.SUCCESS || systemTts == null) {
                if (systemTts != null) systemTts.shutdown();
                systemTts = null;
                systemTtsReady = false;
                speakWithPersistentSystemEngine(call, text, speed, locale, engines, index + 1);
                return;
            }
            systemTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) {
                    if (!utteranceId.equals(activeUtteranceId)) return;
                    PluginCall done = activeSystemCall;
                    activeSystemCall = null;
                    activeUtteranceId = "";
                    if (done != null) done.resolve();
                }
                @Override public void onError(String utteranceId) {
                    finishSystemError(utteranceId, "系统语音播放失败");
                }
                @Override public void onError(String utteranceId, int errorCode) {
                    finishSystemError(utteranceId, "系统语音播放失败：" + errorCode);
                }
            });
            systemTtsReady = true;
            speakNow(call, text, speed, locale);
        };
        holder[0] = packageName.isEmpty()
                ? new TextToSpeech(getContext(), listener)
                : new TextToSpeech(getContext(), listener, packageName);
    }

    private void speakNow(PluginCall call, String text, float speed, Locale locale) {
        if (systemTts == null || !systemTtsReady) { call.reject("系统语音尚未就绪"); return; }
        stopSystemSpeech();
        int language = systemTts.setLanguage(locale);
        if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("系统语音缺少" + locale.getDisplayLanguage(Locale.SIMPLIFIED_CHINESE) + "语音数据，请在系统设置中安装对应语言的语音包");
            return;
        }
        systemTts.setSpeechRate(speed);
        String id = "wd-" + UUID.randomUUID();
        activeSystemCall = call;
        activeUtteranceId = id;
        int result = systemTts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id);
        if (result == TextToSpeech.ERROR) {
            activeSystemCall = null;
            activeUtteranceId = "";
            call.reject("系统语音启动失败");
        }
    }

    private void stopSystemSpeech() {
        if (activeSystemCall != null) {
            activeSystemCall.resolve();
            activeSystemCall = null;
        }
        activeUtteranceId = "";
        if (systemTts != null) systemTts.stop();
    }

    private void finishSystemError(String utteranceId, String message) {
        if (!utteranceId.equals(activeUtteranceId)) return;
        PluginCall failed = activeSystemCall;
        activeSystemCall = null;
        activeUtteranceId = "";
        if (failed != null) failed.reject(message);
    }


    @PluginMethod
    public void speak(PluginCall call) {
        speakOffline(call, false);
    }

    @PluginMethod
    public void speakChinese(PluginCall call) {
        speakOffline(call, true);
    }

    private void speakOffline(PluginCall call, boolean chinese) {
        String text = call.getString("text", "").trim();
        float speed = call.getFloat("speed", 1.0f);
        int sid = call.getInt("sid", 1);
        if (text.isEmpty()) {
            call.reject("没有可朗读的单词");
            return;
        }
        if (chinese ? !chineseInstalled() : !installed()) {
            call.reject(chinese ? "请先下载中文离线语音模型" : "MODEL_NOT_INSTALLED");
            return;
        }
        final float safeSpeed = Math.max(0.5f, Math.min(2.0f, speed));
        final int requestId = pocketSpeakGeneration.incrementAndGet();
        speechWorker.getQueue().clear();
        speechWorker.execute(() -> {
            AudioTrack track = null;
            try {
                OfflineTts engine = chinese ? ensureChineseTts() : ensureTts();
                int sampleRate = engine.sampleRate();
                int minBuffer = AudioTrack.getMinBufferSize(
                        sampleRate,
                        AudioFormat.CHANNEL_OUT_MONO,
                        AudioFormat.ENCODING_PCM_FLOAT
                );
                track = new AudioTrack(
                        new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build(),
                        new AudioFormat.Builder()
                                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                                .setSampleRate(sampleRate)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build(),
                        Math.max(minBuffer, sampleRate),
                        AudioTrack.MODE_STREAM,
                        AudioManager.AUDIO_SESSION_ID_GENERATE
                );
                GenerationConfig config = new GenerationConfig();
                config.setSid(chinese ? 0 : Math.max(0, Math.min(7, sid)));
                config.setSpeed(safeSpeed);
                config.setSilenceScale(0.15f);

                // Avoid generateWithConfigAndCallback(): sherpa-onnx has a known
                // Android JNI callback threading crash. Words are short, so render
                // the complete clip first and then play it.
                GeneratedAudio audio = engine.generateWithConfig(text, config);
                if (audio == null || audio.getSamples() == null || audio.getSamples().length == 0) {
                    throw new Exception("没有生成音频");
                }
                if (audio.getSampleRate() != sampleRate) {
                    throw new Exception("音频采样率异常：" + audio.getSampleRate());
                }
                if (requestId != pocketSpeakGeneration.get()) {
                    call.resolve();
                    return;
                }
                track.play();
                float[] samples = audio.getSamples();
                int offset = 0;
                while (offset < samples.length) {
                    if (requestId != pocketSpeakGeneration.get()) break;
                    int chunk = Math.min(4096, samples.length - offset);
                    int written = track.write(samples, offset, chunk, AudioTrack.WRITE_BLOCKING);
                    if (written < 0) throw new Exception("音频播放失败：" + written);
                    offset += written;
                }
                track.stop();
                call.resolve();
            } catch (Exception e) {
                call.reject("朗读失败：" + e.getMessage());
            } finally {
                if (track != null) track.release();
                // Keep KittenTTS warm so the next word avoids model initialization.
            }
        });
    }

    private synchronized OfflineTts ensureTts() {
        if (tts != null) return tts;
        File d = modelDir();
        OfflineTtsKittenModelConfig kitten = new OfflineTtsKittenModelConfig();
        kitten.setModel(new File(d, "model.onnx").getAbsolutePath());
        kitten.setVoices(new File(d, "voices.bin").getAbsolutePath());
        kitten.setTokens(new File(d, "tokens.txt").getAbsolutePath());
        kitten.setDataDir(new File(d, "espeak-ng-data").getAbsolutePath());
        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setKitten(kitten);
        model.setNumThreads(2);
        model.setDebug(false);
        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        config.setMaxNumSentences(1);
        tts = new OfflineTts(null, config);
        return tts;
    }

    private synchronized OfflineTts ensureChineseTts() {
        if (chineseTts != null) return chineseTts;
        File d = chineseDir();
        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(new File(d, "model.onnx").getAbsolutePath());
        vits.setLexicon(new File(d, "lexicon.txt").getAbsolutePath());
        vits.setTokens(new File(d, "tokens.txt").getAbsolutePath());
        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setVits(vits);
        model.setNumThreads(2);
        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        config.setMaxNumSentences(1);
        chineseTts = new OfflineTts(null, config);
        return chineseTts;
    }

    private synchronized void releaseTts() {
        if (tts != null) {
            tts.release();
            tts = null;
        }
        if (chineseTts != null) {
            chineseTts.release();
            chineseTts = null;
        }
    }

    private String[] sourceOrder(String source) {
        if ("global".equals(source)) {
            return new String[]{OFFICIAL_URL, GHFAST_URL, GHPROXY_NET_URL, GITHUBPROXY_CC_URL};
        }
        if ("cn".equals(source)) {
            return new String[]{GHFAST_URL, GHPROXY_NET_URL, GITHUBPROXY_CC_URL, OFFICIAL_URL};
        }
        // Auto favors the two release mirrors that currently support Range requests,
        // then falls back to official GitHub and a third mirror.
        return new String[]{GHFAST_URL, GHPROXY_NET_URL, OFFICIAL_URL, GITHUBPROXY_CC_URL};
    }

    private String sourceName(String address) {
        if (address.startsWith("https://ghfast.top/")) return "GHFast";
        if (address.startsWith("https://ghproxy.net/")) return "GHProxy.net";
        if (address.startsWith("https://githubproxy.cc/")) return "GitHubProxy.cc";
        return "GitHub";
    }

    private String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : md.digest()) out.append(String.format("%02x", b));
        return out.toString();
    }

    private void notifyDownloadState(String state, String address, int attempt) {
        JSObject p = new JSObject();
        p.put("state", state);
        p.put("source", sourceName(address));
        p.put("attempt", attempt);
        notifyListeners("downloadProgress", p);
    }

    private void downloadResumable(String address, File dest) throws Exception {
        long existing = dest.exists() ? dest.length() : 0L;
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(12000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "Word-Dictation/0.4.1");
        c.setRequestProperty("Accept", "application/octet-stream,*/*");
        if (existing > 0) c.setRequestProperty("Range", "bytes=" + existing + "-");
        c.connect();

        int code = c.getResponseCode();
        boolean append = existing > 0 && code == HttpURLConnection.HTTP_PARTIAL;
        if (code < 200 || code >= 300) {
            c.disconnect();
            throw new Exception("HTTP " + code);
        }
        if (!append && existing > 0) {
            existing = 0L;
        }

        long bodyLength = c.getContentLengthLong();
        long total = bodyLength > 0 ? existing + bodyLength : -1L;
        long done = existing;
        int lastProgress = -1;

        try (InputStream in = new BufferedInputStream(c.getInputStream());
             BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(dest, append))) {
            byte[] buf = new byte[128 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                done += n;
                int progress = total > 0 ? (int) Math.min(95, done * 95 / total) : 0;
                if (progress != lastProgress) {
                    lastProgress = progress;
                    JSObject p = new JSObject();
                    p.put("progress", progress);
                    p.put("downloaded", done);
                    p.put("total", total);
                    p.put("source", sourceName(address));
                    notifyListeners("downloadProgress", p);
                }
            }
        } finally {
            c.disconnect();
        }
    }

    private void extractTarBz2(File archive, File destination) throws Exception {
        String root = destination.getCanonicalPath() + File.separator;
        try (TarArchiveInputStream tar = new TarArchiveInputStream(
                new BZip2CompressorInputStream(new BufferedInputStream(new FileInputStream(archive))))) {
            TarArchiveEntry entry;
            byte[] buffer = new byte[128 * 1024];
            while ((entry = tar.getNextTarEntry()) != null) {
                File out = new File(destination, entry.getName());
                String canonical = out.getCanonicalPath();
                if (!canonical.startsWith(root)) throw new SecurityException("非法模型路径");
                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) throw new Exception("无法创建目录");
                    continue;
                }
                File parent = out.getParentFile();
                if (!parent.exists() && !parent.mkdirs()) throw new Exception("无法创建目录");
                try (BufferedOutputStream fileOut = new BufferedOutputStream(new FileOutputStream(out))) {
                    int n;
                    while ((n = tar.read(buffer)) != -1) fileOut.write(buffer, 0, n);
                }
            }
        }
    }

    private void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        f.delete();
    }

    @Override
    protected void handleOnDestroy() {
        releaseTts();
        stopSystemSpeech();
        if (systemTts != null) {
            systemTts.shutdown();
            systemTts = null;
        }
        pocketSpeakGeneration.incrementAndGet();
        speechWorker.shutdownNow();
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
