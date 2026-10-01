package com.rtc.worddictation;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GenerationConfig;
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
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PocketTts")
public class PocketTtsPlugin extends Plugin {
    private static final String MODEL_NAME = "sherpa-onnx-pocket-tts-int8-2026-01-26";
    private static final String OFFICIAL_URL =
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + MODEL_NAME + ".tar.bz2";
    private static final String CHINA_URL =
            "https://ghfast.top/" + OFFICIAL_URL;

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
                String preferred = chooseSource(source);
                String[] urls;
                if ("auto".equals(source)) {
                    urls = preferred.equals(CHINA_URL)
                            ? new String[]{CHINA_URL, OFFICIAL_URL}
                            : new String[]{OFFICIAL_URL, CHINA_URL};
                } else {
                    urls = new String[]{preferred};
                }

                String usedUrl = null;
                Exception lastError = null;
                for (String url : urls) {
                    archive.delete();
                    for (int attempt = 1; attempt <= 3; attempt++) {
                        try {
                            notifyDownloadState("正在连接", url, attempt);
                            downloadResumable(url, archive);
                            if (archive.length() < 50L * 1024 * 1024) {
                                throw new Exception("下载内容异常（仅 " + (archive.length() / 1024 / 1024) + " MB）");
                            }
                            usedUrl = url;
                            lastError = null;
                            break;
                        } catch (Exception e) {
                            lastError = e;
                            notifyDownloadState("连接失败，正在重试", url, attempt);
                            try { Thread.sleep(1200L * attempt); } catch (InterruptedException ignored) {}
                        }
                    }
                    if (usedUrl != null) break;
                }
                if (usedUrl == null) throw (lastError != null ? lastError : new Exception("所有下载源均不可用"));

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
                ret.put("source", usedUrl.startsWith("https://ghfast.top/") ? "cn" : "global");
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
                final AudioTrack out = track;
                out.play();

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

                tts.generateWithConfigAndCallback(text, config, samples -> {
                    out.write(samples, 0, samples.length, AudioTrack.WRITE_BLOCKING);
                    return 1;
                });
                out.stop();
                call.resolve();
            } catch (Exception e) {
                call.reject("朗读失败：" + e.getMessage());
            } finally {
                if (track != null) track.release();
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

    private String chooseSource(String source) {
        if ("cn".equals(source)) return CHINA_URL;
        if ("global".equals(source)) return OFFICIAL_URL;
        long global = probe(OFFICIAL_URL);
        long cn = probe(CHINA_URL);
        if (cn >= 0 && (global < 0 || cn < global)) return CHINA_URL;
        return OFFICIAL_URL;
    }

    private long probe(String address) {
        long start = System.currentTimeMillis();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(address).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(3500);
            c.setReadTimeout(3500);
            c.setRequestProperty("Range", "bytes=0-0");
            c.setRequestProperty("User-Agent", "Word-Dictation/0.4");
            int code = c.getResponseCode();
            if (code >= 200 && code < 400) return System.currentTimeMillis() - start;
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
        return -1;
    }

    private void notifyDownloadState(String state, String address, int attempt) {
        JSObject p = new JSObject();
        p.put("state", state);
        p.put("source", address.startsWith("https://ghfast.top/") ? "cn" : "global");
        p.put("attempt", attempt);
        notifyListeners("downloadProgress", p);
    }

    private void downloadResumable(String address, File dest) throws Exception {
        long existing = dest.exists() ? dest.length() : 0L;
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(30000);
        c.setReadTimeout(120000);
        c.setRequestProperty("User-Agent", "Word-Dictation/0.4");
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
                    p.put("source", address.startsWith("https://ghfast.top/") ? "cn" : "global");
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
