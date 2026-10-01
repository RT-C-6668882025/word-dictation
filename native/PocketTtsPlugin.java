package com.rtc.worddictation;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

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
import com.k2fsa.sherpa.onnx.OfflineTtsPocketModelConfig;
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
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PocketTts")
public class PocketTtsPlugin extends Plugin {
    private static final String MODEL_NAME = "sherpa-onnx-pocket-tts-int8-2026-01-26";
    private static final String OFFICIAL_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + MODEL_NAME + ".tar.bz2";
    private static final String GHFAST_URL = "https://ghfast.top/" + OFFICIAL_URL;
    private static final String GHPROXY_NET_URL = "https://ghproxy.net/" + OFFICIAL_URL;
    private static final String GITHUBPROXY_CC_URL = "https://githubproxy.cc/" + OFFICIAL_URL;
    private static final String MODEL_SHA256 = "2f3b88823cbbb9bf0b2477ec8ae7b3fec417b3a87b6bb5f256dba66f2ad967cb";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;
    private OfflineTts tts;

    private File modelParent() {
        return new File(getContext().getFilesDir(), "voice");
    }

    private File modelDir() {
        return new File(modelParent(), MODEL_NAME);
    }

    private boolean installed() {
        File d = modelDir();
        return new File(d, "lm_flow.int8.onnx").isFile()
                && new File(d, "lm_main.int8.onnx").isFile()
                && new File(d, "encoder.onnx").isFile()
                && new File(d, "decoder.int8.onnx").isFile()
                && new File(d, "text_conditioner.onnx").isFile()
                && new File(d, "vocab.json").isFile()
                && new File(d, "token_scores.json").isFile()
                && new File(d, "test_wavs/bria.wav").isFile();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", installed());
        ret.put("downloading", downloading);
        ret.put("model", "Pocket TTS INT8");
        ret.put("downloadMB", 98);
        ret.put("diskMB", 190);
        call.resolve(ret);
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
                            if (archive.length() != 98336520L) {
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
    public void speakSystem(PluginCall call) {
        String text = call.getString("text", "").trim();
        float speed = call.getFloat("speed", 1.0f);
        if (text.isEmpty()) { call.reject("没有可朗读的单词"); return; }
        final float safeSpeed = Math.max(0.7f, Math.min(1.35f, speed));
        getActivity().runOnUiThread(() -> {
            TextToSpeech probe = new TextToSpeech(getContext(), status -> {});
            List<TextToSpeech.EngineInfo> engines = probe.getEngines();
            probe.shutdown();
            if (engines == null || engines.isEmpty()) {
                call.reject("系统没有可用的语音引擎");
                return;
            }
            speakWithSystemEngine(call, text, safeSpeed, engines, 0);
        });
    }

    private void speakWithSystemEngine(PluginCall call, String text, float speed,
                                       List<TextToSpeech.EngineInfo> engines, int index) {
        if (index >= engines.size()) {
            call.reject("系统语音引擎均无法使用英语");
            return;
        }
        String packageName = engines.get(index).name;
        final TextToSpeech[] holder = new TextToSpeech[1];
        holder[0] = new TextToSpeech(getContext(), status -> {
            TextToSpeech engine = holder[0];
            if (status != TextToSpeech.SUCCESS || engine == null) {
                if (engine != null) engine.shutdown();
                speakWithSystemEngine(call, text, speed, engines, index + 1);
                return;
            }
            int lang = engine.setLanguage(Locale.US);
            if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                engine.shutdown();
                speakWithSystemEngine(call, text, speed, engines, index + 1);
                return;
            }
            engine.setSpeechRate(speed);
            String id = "wd-" + UUID.randomUUID();
            engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) {
                    engine.shutdown();
                    call.resolve();
                }
                @Override public void onError(String utteranceId) {
                    engine.shutdown();
                    call.reject("系统语音播放失败：" + packageName);
                }
                @Override public void onError(String utteranceId, int errorCode) {
                    engine.shutdown();
                    call.reject("系统语音播放失败：" + packageName + " · " + errorCode);
                }
            });
            int result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), id);
            if (result == TextToSpeech.ERROR) {
                engine.shutdown();
                speakWithSystemEngine(call, text, speed, engines, index + 1);
            }
        }, packageName);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        float speed = call.getFloat("speed", 1.0f);
        if (text.isEmpty()) {
            call.reject("没有可朗读的单词");
            return;
        }
        if (!installed()) {
            call.reject("MODEL_NOT_INSTALLED");
            return;
        }
        final float safeSpeed = Math.max(0.7f, Math.min(1.35f, speed));
        worker.execute(() -> {
            AudioTrack track = null;
            try {
                ensureTts();
                int sampleRate = tts.sampleRate();
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
                WaveData wave = WaveReader.Companion.readWave(new File(modelDir(), "test_wavs/bria.wav").getAbsolutePath());
                GenerationConfig config = new GenerationConfig();
                config.setReferenceAudio(wave.getSamples());
                config.setReferenceSampleRate(wave.getSampleRate());
                config.setNumSteps(2);
                config.setSpeed(safeSpeed);
                Map<String, String> extra = new HashMap<>();
                extra.put("temperature", "0.7");
                extra.put("chunk_size", "15");
                extra.put("seed", "42");
                config.setExtra(extra);

                // Avoid generateWithConfigAndCallback(): sherpa-onnx has a known
                // Android JNI callback threading crash. Words are short, so render
                // the complete clip first and then play it.
                GeneratedAudio audio = tts.generateWithConfig(text, config);
                if (audio == null || audio.getSamples() == null || audio.getSamples().length == 0) {
                    throw new Exception("没有生成音频");
                }
                if (audio.getSampleRate() != sampleRate) {
                    throw new Exception("音频采样率异常：" + audio.getSampleRate());
                }
                track.play();
                float[] samples = audio.getSamples();
                int offset = 0;
                while (offset < samples.length) {
                    int written = track.write(samples, offset, samples.length - offset, AudioTrack.WRITE_BLOCKING);
                    if (written < 0) throw new Exception("音频播放失败：" + written);
                    offset += written;
                }
                track.stop();
                call.resolve();
            } catch (Exception e) {
                call.reject("朗读失败：" + e.getMessage());
            } finally {
                if (track != null) track.release();
                // sherpa-onnx Android has had native crashes when reusing one OfflineTts
                // instance across sequential generations. Recreate per utterance for stability.
                releaseTts();
            }
        });
    }

    private synchronized void ensureTts() {
        if (tts != null) return;
        File d = modelDir();
        OfflineTtsPocketModelConfig pocket = new OfflineTtsPocketModelConfig();
        pocket.setLmFlow(new File(d, "lm_flow.int8.onnx").getAbsolutePath());
        pocket.setLmMain(new File(d, "lm_main.int8.onnx").getAbsolutePath());
        pocket.setEncoder(new File(d, "encoder.onnx").getAbsolutePath());
        pocket.setDecoder(new File(d, "decoder.int8.onnx").getAbsolutePath());
        pocket.setTextConditioner(new File(d, "text_conditioner.onnx").getAbsolutePath());
        pocket.setVocabJson(new File(d, "vocab.json").getAbsolutePath());
        pocket.setTokenScoresJson(new File(d, "token_scores.json").getAbsolutePath());
        pocket.setVoiceEmbeddingCacheCapacity(4);
        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setPocket(pocket);
        model.setNumThreads(2);
        model.setDebug(false);
        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        tts = new OfflineTts(null, config);
    }

    private synchronized void releaseTts() {
        if (tts != null) {
            tts.release();
            tts = null;
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
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
