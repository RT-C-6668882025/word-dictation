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
        AttachmentStore.cleanup(context,state);
    }
    public static synchronized JSONObject saveBooks(Context context, long revision, JSONArray books) throws Exception {
        JSONObject state = load(context, null);
        if (state.optLong("revision") != revision) throw new IOException("词库刚被 AI 修改，已刷新，请重试本次操作");
        state.put("books", books).put("revision", revision + 1); save(context, state); return state;
    }
    public static synchronized JSONObject execute(Context context, JSONObject request) throws Exception {
        JSONObject state = load(context, null);
        if (request.optString("name").equals("upload_attachment")) {
            JSONObject args=request.getJSONObject("arguments"),response=new JSONObject();boolean changed=false;
            try {
                JSONArray books=state.getJSONArray("books");JSONObject target=null;
                for(int b=0;b<books.length();b++){JSONObject book=books.getJSONObject(b);if(!book.getString("id").equals(args.optString("book_id")))continue;JSONArray words=book.getJSONArray("words");for(int i=0;i<words.length();i++)if(words.getJSONObject(i).getString("id").equals(args.optString("word_id")))target=words.getJSONObject(i);}
                if(target==null)throw new IOException("内容不存在");String name=args.getString("name"),side=args.getString("side");
                if(name.trim().isEmpty()||name.length()>200||(!side.equals("front")&&!side.equals("back")))throw new IOException("附件名称或所在面无效");
                JSONArray attachments=target.optJSONArray("attachments");if(attachments==null)attachments=new JSONArray();boolean exists=false;
                JSONObject attachment=new JSONObject().put("id",args.getString("attachment_id")).put("name",name).put("mime",args.getString("mime")).put("size",args.getLong("size")).put("side",side);
                for(int i=0;i<attachments.length();i++)if(attachments.getJSONObject(i).getString("id").equals(attachment.getString("id"))){exists=true;JSONObject old=attachments.getJSONObject(i);for(String key:new String[]{"name","mime","size","side"})if(!old.optString(key).equals(attachment.optString(key)))throw new IOException("附件 ID 已被使用");}
                if(!exists&&attachments.length()>=20)throw new IOException("每条卡片最多 20 个附件");
                JSONObject writeArgs=new JSONObject(args.toString()).put("id",args.getString("attachment_id")).put("data",args.getString("data_base64"));
                JSONObject result=AttachmentStore.write(context,writeArgs);
                if(args.getBoolean("final")){if(!exists){attachments.put(attachment);target.put("attachments",attachments);state.put("revision",state.optLong("revision")+1);changed=true;}save(context,state);result.put("attachment",attachment).put("book_id",args.getString("book_id")).put("word_id",args.getString("word_id"));}
                response.put("result",result);
            }catch(Exception e){response.put("error",e.getMessage()).put("data_changed",changed);}
            return new JSONObject().put("response",response).put("state",state).put("changed",changed);
        }
        if (request.optString("name").equals("get_attachment")) {
            JSONObject response=new JSONObject();try {response.put("result",AttachmentStore.readForAgent(context,state,request.getJSONObject("arguments")));}
            catch(Exception e){response.put("error",e.getMessage()).put("data_changed",false);}
            return new JSONObject().put("response",response).put("state",state).put("changed",false);
        }
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
