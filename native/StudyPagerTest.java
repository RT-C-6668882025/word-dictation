package com.rtc.worddictation;

import static org.junit.Assert.*;
import android.app.Activity;
import android.os.Looper;
import android.os.SystemClock;
import android.view.*;
import android.widget.*;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import androidx.viewpager2.widget.ViewPager2;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.time.Duration;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class StudyPagerTest {
    private Activity activity;
    private FrameLayout root;
    private ViewPager2 pager;
    private long start;
    @Before public void setup(){
        activity=Robolectric.buildActivity(Activity.class).setup().get();
        root=new FrameLayout(activity);activity.setContentView(root);
        pager=new ViewPager2(activity);pager.setOrientation(ViewPager2.ORIENTATION_VERTICAL);
        pager.setAdapter(new RecyclerView.Adapter<RecyclerView.ViewHolder>(){
            @NonNull @Override public RecyclerView.ViewHolder onCreateViewHolder(@NonNull android.view.ViewGroup parent,int type){TextView text=new TextView(parent.getContext());text.setLayoutParams(new RecyclerView.LayoutParams(-1,-1));return new RecyclerView.ViewHolder(text){};}
            @Override public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder,int position){((TextView)holder.itemView).setText("Page "+position);}
            @Override public int getItemCount(){return 3;}
        });
        root.addView(pager,new FrameLayout.LayoutParams(-1,-1));layout();start=SystemClock.uptimeMillis();
    }
    private void layout(){root.measure(View.MeasureSpec.makeMeasureSpec(400,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(800,View.MeasureSpec.EXACTLY));root.layout(0,0,400,800);}
    private void touch(int action,float y){MotionEvent e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,180,y,0);pager.dispatchTouchEvent(e);e.recycle();Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(20));}
    @Test public void nativePagerMovesBeforeFingerReleaseAndSnapsAfterward(){
        final int[] offset={0};pager.registerOnPageChangeCallback(new ViewPager2.OnPageChangeCallback(){@Override public void onPageScrolled(int position,float fraction,int pixels){offset[0]=Math.max(offset[0],pixels);}});
        touch(MotionEvent.ACTION_DOWN,650);for(int y=630;y>=150;y-=20)touch(MotionEvent.ACTION_MOVE,y);
        assertTrue("native page must move while finger is still down",offset[0]>0);
        touch(MotionEvent.ACTION_UP,150);
        for(int i=0;i<80;i++)Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(16));
        assertEquals(ViewPager2.ORIENTATION_VERTICAL,pager.getOrientation());
        assertEquals("swipe must settle on the next page",1,pager.getCurrentItem());
        assertEquals(ViewPager2.SCROLL_STATE_IDLE,pager.getScrollState());
    }
    @Test public void shortCancelledDragReturnsToCurrentPage(){
        touch(MotionEvent.ACTION_DOWN,500);touch(MotionEvent.ACTION_MOVE,480);touch(MotionEvent.ACTION_MOVE,450);touch(MotionEvent.ACTION_CANCEL,450);
        for(int i=0;i<80;i++)Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(16));
        assertEquals(0,pager.getCurrentItem());
    }
    @Test public void readingGestureStaysWithLongContentUntilNextGesture(){
        FrameLayout parent=new FrameLayout(activity){@Override public void requestDisallowInterceptTouchEvent(boolean value){disallowed=value;super.requestDisallowInterceptTouchEvent(value);}};
        StudyPagerPlugin.BoundaryHost host=new StudyPagerPlugin.BoundaryHost(activity);parent.addView(host);
        final boolean[] canScroll={true};host.addView(new View(activity){@Override public boolean canScrollVertically(int direction){return canScroll[0];}});
        send(host,MotionEvent.ACTION_DOWN,500);assertTrue(disallowed);
        send(host,MotionEvent.ACTION_MOVE,400);assertTrue(disallowed);
        canScroll[0]=false;send(host,MotionEvent.ACTION_MOVE,250);assertTrue("reaching the bottom must not jump pages midway through a reading gesture",disallowed);
        send(host,MotionEvent.ACTION_UP,250);send(host,MotionEvent.ACTION_DOWN,500);send(host,MotionEvent.ACTION_MOVE,400);assertFalse("new upward gesture at bottom must reach native pager",disallowed);
        send(host,MotionEvent.ACTION_DOWN,400);send(host,MotionEvent.ACTION_MOVE,500);assertFalse("downward gesture at top must reach native pager",disallowed);
    }
    private boolean disallowed;
    private void send(StudyPagerPlugin.BoundaryHost host,int action,float y){MotionEvent e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,180,y,0);host.onInterceptTouchEvent(e);e.recycle();}
    @After public void cleanup(){activity.finish();}
}
