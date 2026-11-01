package com.domochitreats.game;

import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The screen's turning, as the player picks it in Settings. "landscape" and
 * "portrait" follow the phone's sensor, so either way up works (a phone on a
 * charger can be flipped 180°); "auto" turns freely.
 */
@CapacitorPlugin(name = "Orientation")
public class OrientationPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        String mode = call.getString("mode", "landscape");
        int value;
        if ("portrait".equals(mode)) value = ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        else if ("auto".equals(mode)) value = ActivityInfo.SCREEN_ORIENTATION_FULL_USER;
        else value = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(value);
            call.resolve();
        });
    }
}
