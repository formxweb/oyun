package games.vertigo.plugins;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.tasks.Task;
import org.json.JSONObject;

/**
 * Play Games Services v2: sign-in for cloud saves and leaderboards, and achievements.
 *
 * Sign-in returns a one-time server auth code; only the game's backend can exchange it (with
 * an OAuth client secret the app never contains). Achievement ids are the Play Console's,
 * read from its exported games-ids.xml resource (achievement_<key>), never hard-coded.
 */
@CapacitorPlugin(name = "VertigoGames")
public class VertigoGamesPlugin extends Plugin {

    @Override
    public void load() {
        if (configured()) PlayGamesSdk.initialize(getContext());
    }

    /** Play Games is only used when the project ids were supplied at build time. */
    private boolean configured() {
        return stringRes("game_services_project_id") != 0 && stringRes("server_client_id") != 0;
    }

    private int stringRes(String name) {
        Context c = getContext();
        return c.getResources().getIdentifier(name, "string", c.getPackageName());
    }

    @PluginMethod
    public void signIn(final PluginCall call) {
        if (!configured()) {
            noCode(call);
            return;
        }
        final String serverClientId = getContext().getString(stringRes("server_client_id"));
        final GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        client.isAuthenticated()
            .continueWithTask(t -> {
                boolean signedIn = t.isSuccessful() && t.getResult().isAuthenticated();
                Task<AuthenticationResult> next = signedIn ? t : client.signIn();
                return next;
            })
            .addOnCompleteListener(t -> {
                if (!t.isSuccessful() || !t.getResult().isAuthenticated()) {
                    noCode(call);
                    return;
                }
                client.requestServerSideAccess(serverClientId, false).addOnCompleteListener(code -> {
                    JSObject r = new JSObject();
                    r.put("serverAuthCode", code.isSuccessful() && code.getResult() != null ? code.getResult() : JSONObject.NULL);
                    call.resolve(r);
                });
            });
    }

    @PluginMethod
    public void unlock(final PluginCall call) {
        String key = call.getString("key", "");
        int res = configured() && key != null && key.matches("[a-z0-9_]{1,48}") ? stringRes("achievement_" + key) : 0;
        if (res != 0) PlayGames.getAchievementsClient(getActivity()).unlock(getContext().getString(res));
        call.resolve();
    }

    private static void noCode(PluginCall call) {
        JSObject r = new JSObject();
        r.put("serverAuthCode", JSONObject.NULL);
        call.resolve(r);
    }
}
