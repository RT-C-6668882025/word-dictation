package com.rtc.worddictation;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
import org.mozilla.javascript.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** One serialized, durable store for manual edits and background commands. */
public final class AiWordStore {
    private static final String KEY = "wd_state_v3";
    private static String engine;
    private static SharedPreferences preferences(Context context) { return context.getSharedPreferences("CapacitorStorage", 0); }
    public static synchronized JSONObject load(Context context, String initial) throws Exception {
        SharedPreferences p = preferences(context);
        String raw = p.getString(KEY, null);
        if (raw == null) {
            JSONObject state = new JSONObject(initial == null ? "{\"books\":[],\"receipts\":{}}" : initial);
            state.put("revision", 0); save(context, state); return state;
        }
        JSONObject state = new JSONObject(raw);
        if (!state.has("revision")) state.put("revision", 0);
        return state;
    }
    private static void save(Context context, JSONObject state) throws IOException {
        if (!preferences(context).edit().putString(KEY, state.toString()).commit()) throw new IOException("词库保存失败，请重试");
    }
    public static synchronized JSONObject saveBooks(Context context, long revision, JSONArray books) throws Exception {
        JSONObject state = load(context, null);
        if (state.optLong("revision") != revision) throw new IOException("词库刚被 AI 修改，已刷新，请重试本次操作");
        state.put("books", books).put("revision", revision + 1); save(context, state); return state;
    }
    public static synchronized JSONObject execute(Context context, JSONObject request) throws Exception {
        JSONObject state = load(context, null);
        org.mozilla.javascript.Context js = org.mozilla.javascript.Context.enter();
        try {
            js.setOptimizationLevel(-1); js.setLanguageVersion(org.mozilla.javascript.Context.VERSION_ES6);
            js.setClassShutter(name -> false);
            Scriptable scope = js.initSafeStandardObjects();
            if (engine == null) {
                try (InputStream in = context.getAssets().open("ai-engine.js"); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[4096]; int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                    engine = out.toString(StandardCharsets.UTF_8.name());
                }
            }
            js.evaluateString(scope, engine, "ai-engine.js", 1, null);
            Scriptable api = (Scriptable)ScriptableObject.getProperty(scope, "WordAiEngine");
            Function fn = (Function)ScriptableObject.getProperty(api, "transact");
            JSONObject transaction = new JSONObject(org.mozilla.javascript.Context.toString(fn.call(js, scope, api, new Object[]{state.toString(), request.toString()})));
            // A replay also reconfirms persistence: a failed commit can have updated the Preferences memory cache.
            JSONObject response = transaction.getJSONObject("response");
            if (transaction.getBoolean("changed") || (response.optJSONObject("result") != null && response.getJSONObject("result").optBoolean("saved"))) save(context, transaction.getJSONObject("state"));
            return transaction;
        } finally { org.mozilla.javascript.Context.exit(); }
    }
}
