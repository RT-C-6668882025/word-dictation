package com.rtc.worddictation;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import androidx.webkit.WebViewAssetLoader;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.util.*;
import org.json.*;

/** Native drag, velocity tracking and snapping; the local WebViews render study content only. */
@CapacitorPlugin(name="StudyPager")
public class StudyPagerPlugin extends Plugin {
    static final String PAGE="https://appassets.androidplatform.net/assets/public/pager.html";
    private String owner;
    private FrameLayout host;
    private ViewPager2 pager;
    private Pages adapter;
    private boolean applying;
    private final ArrayList<Holder> holders=new ArrayList<>();
    private WebViewAssetLoader assets;

    @PluginMethod public void update(PluginCall call) {
        getActivity().runOnUiThread(()->{
            try {
                String requested=call.getString("owner");
                if(requested==null)throw new IllegalArgumentException("Missing pager owner");
                JSONArray models=new JSONArray(call.getString("models","[]"));
                if(models.length()==0)throw new IllegalArgumentException("Missing pages");
                if(!requested.equals(owner)){dispose();owner=requested;create();}
                applying=true;
                try {
                    adapter.setModels(models);
                    int index=Math.max(0,Math.min(models.length()-1,call.getInt("current",0)));
                    // Data refresh during a finger drag must not fight the user's gesture.
                    if(pager.getCurrentItem()!=index&&pager.getScrollState()==ViewPager2.SCROLL_STATE_IDLE)
                        pager.setCurrentItem(index,host.getVisibility()==View.VISIBLE&&host.getWidth()>0);
                    position(call.getData());
                    host.setVisibility(call.getBoolean("visible",true)?View.VISIBLE:View.GONE);
                } finally {applying=false;}
                call.resolve();
            }catch(Exception e){call.reject("原生分页更新失败",e);}
        });
    }
    @PluginMethod public void layout(PluginCall call){getActivity().runOnUiThread(()->{if(Objects.equals(owner,call.getString("owner"))&&host!=null)position(call.getData());call.resolve();});}
    @PluginMethod public void close(PluginCall call){getActivity().runOnUiThread(()->{if(Objects.equals(owner,call.getString("owner")))dispose();call.resolve();});}
    private void create(){
        assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(getContext())).build();
        host=new FrameLayout(getContext());host.setVisibility(View.INVISIBLE);host.setBackgroundColor(Color.rgb(244,243,239));
        pager=new ViewPager2(getContext());pager.setId(View.generateViewId());pager.setOrientation(ViewPager2.ORIENTATION_VERTICAL);pager.setOffscreenPageLimit(1);
        ((RecyclerView)pager.getChildAt(0)).setItemAnimator(null);
        adapter=new Pages();pager.setAdapter(adapter);
        pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback(){
            @Override public void onPageScrollStateChanged(int state){if(state==ViewPager2.SCROLL_STATE_IDLE&&!applying&&owner!=null)event("page",null,pager.getCurrentItem());}
        });
        host.addView(pager,new FrameLayout.LayoutParams(-1,-1));
        ((ViewGroup)getActivity().findViewById(android.R.id.content)).addView(host,new FrameLayout.LayoutParams(1,1));
    }
    private void position(JSONObject rect){
        View web=getBridge().getWebView(),root=getActivity().findViewById(android.R.id.content);
        double viewport=rect.optDouble("viewportWidth",1),scale=web.getWidth()/Math.max(1,viewport);
        int[] webAt=new int[2],rootAt=new int[2];web.getLocationInWindow(webAt);root.getLocationInWindow(rootAt);
        FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(Math.max(1,(int)Math.round(rect.optDouble("width")*scale)),Math.max(1,(int)Math.round(rect.optDouble("height")*scale)));
        p.leftMargin=webAt[0]-rootAt[0]+(int)Math.round(rect.optDouble("x")*scale);
        p.topMargin=webAt[1]-rootAt[1]+(int)Math.round(rect.optDouble("y")*scale);
        host.setLayoutParams(p);
    }
    private void event(String action,String value,int index){
        JSObject out=new JSObject().put("owner",owner).put("action",action);
        if(value!=null)out.put("value",value);if(index>=0)out.put("index",index);notifyListeners("action",out);
    }
    private void dispose(){
        owner=null;
        if(host!=null&&host.getParent() instanceof ViewGroup)((ViewGroup)host.getParent()).removeView(host);
        for(Holder h:holders){h.web.stopLoading();h.web.removeJavascriptInterface("StudyPageHost");h.web.destroy();}holders.clear();
        host=null;pager=null;adapter=null;
    }
    @Override protected void handleOnDestroy(){getActivity().runOnUiThread(this::dispose);}
    private class Pages extends RecyclerView.Adapter<Holder>{
        final ArrayList<JSONObject> models=new ArrayList<>();
        void setModels(JSONArray raw)throws JSONException{
            ArrayList<JSONObject> next=new ArrayList<>();HashSet<String> ids=new HashSet<>();
            for(int i=0;i<raw.length();i++){JSONObject m=raw.getJSONObject(i);String id=m.getJSONObject("page").getString("id");if(!ids.add(id))throw new JSONException("Duplicate page ID");next.add(m);}
            boolean structure=next.size()!=models.size();if(!structure)for(int i=0;i<next.size();i++)if(!id(next.get(i)).equals(id(models.get(i)))){structure=true;break;}
            models.clear();models.addAll(next);
            if(structure)notifyDataSetChanged();
            for(Holder h:holders){if(h.model==null)continue;String wanted=id(h.model);for(JSONObject m:models)if(id(m).equals(wanted)){h.bind(m);break;}}
        }
        String id(JSONObject model){return model.optJSONObject("page").optString("id");}
        @NonNull @Override public Holder onCreateViewHolder(@NonNull ViewGroup parent,int type){Holder h=new Holder();holders.add(h);return h;}
        @Override public void onBindViewHolder(@NonNull Holder h,int position){h.bind(models.get(position));}
        @Override public int getItemCount(){return models.size();}
    }
    private class Holder extends RecyclerView.ViewHolder{
        final BoundaryHost frame;
        final WebView web;
        JSONObject model;
        String encoded="";
        boolean loaded;
        Holder(){this(new BoundaryHost(getContext()));}
        @SuppressLint({"SetJavaScriptEnabled","JavascriptInterface"}) Holder(BoundaryHost frame){
            super(frame);this.frame=frame;frame.setLayoutParams(new ViewGroup.LayoutParams(-1,-1));
            web=new WebView(getContext());web.setBackgroundColor(Color.rgb(244,243,239));web.setOverScrollMode(View.OVER_SCROLL_NEVER);web.setVerticalScrollBarEnabled(false);
            WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setDomStorageEnabled(false);settings.setMediaPlaybackRequiresUserGesture(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            web.addJavascriptInterface(new Object(){@JavascriptInterface public void postMessage(String raw){
                final JSONObject message;try{message=new JSONObject(raw);}catch(Exception e){return;}
                getActivity().runOnUiThread(()->{
                    if(owner==null||!holders.contains(Holder.this)||model==null)return;
                    String action=message.optString("action"),value=message.optString("value");
                    if(action.equals("need")){JSONArray entries=model.optJSONArray("entries");if(entries!=null)for(int i=0;i<entries.length();i++)if(value.equals(entries.optJSONObject(i).optString("id"))){event("need",value,-1);break;}}
                    if(action.equals("speak")&&value.length()<=800000)event("speak",value,-1);
                });
            }},"StudyPageHost");
            web.setWebViewClient(new WebViewClient(){
                @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                    Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/public/")){
                        WebResourceResponse response=assets.shouldInterceptRequest(uri);if(response!=null)return response;
                    }
                    return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
                @Override public void onPageFinished(WebView view,String url){if(PAGE.equals(url)){loaded=true;render();}}
                @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())view.post(()->{if(host!=null&&holders.contains(Holder.this)){host.setVisibility(View.GONE);event("error",null,-1);}});}
            });
            frame.addView(web,new FrameLayout.LayoutParams(-1,-1));web.loadUrl(PAGE);
        }
        void bind(JSONObject next){String raw=next.toString();if(raw.equals(encoded))return;String previous=model==null?"":model.optJSONObject("page").optString("id");model=next;encoded=raw;if(!previous.equals(next.optJSONObject("page").optString("id")))web.scrollTo(0,0);render();}
        void render(){if(loaded&&model!=null)web.evaluateJavascript("window.receiveStudyPage&&window.receiveStudyPage("+encoded+")",null);}
    }
    /** Assign one gesture to either page reading or the native pager, avoiding boundary jumps. */
    static class BoundaryHost extends FrameLayout {
        private float x,y;private int owner;private final int slop;
        BoundaryHost(android.content.Context context){super(context);slop=ViewConfiguration.get(context).getScaledTouchSlop();}
        @Override public boolean onInterceptTouchEvent(MotionEvent e){
            if(e.getActionMasked()==MotionEvent.ACTION_DOWN){x=e.getX();y=e.getY();owner=0;getParent().requestDisallowInterceptTouchEvent(true);}
            else if(e.getActionMasked()==MotionEvent.ACTION_MOVE&&owner==0){float dx=e.getX()-x,dy=e.getY()-y;if(Math.max(Math.abs(dx),Math.abs(dy))>slop){View child=getChildAt(0);owner=Math.abs(dx)>Math.abs(dy)||child.canScrollVertically(dy<0?1:-1)?1:2;getParent().requestDisallowInterceptTouchEvent(owner==1);}}
            return super.onInterceptTouchEvent(e);
        }
    }
}
