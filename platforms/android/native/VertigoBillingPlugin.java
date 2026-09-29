package games.vertigo.plugins;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;

/**
 * Google Play Billing (Play Billing Library 8) for VERTIGO's cosmetic store.
 *
 * This plugin only talks to Play. It never acknowledges or consumes a purchase and never
 * decides what the player owns: the game sends the purchase token to the backend, which
 * verifies it with the Android Publisher API, acknowledges it and records the entitlement.
 * Cosmetics are one-time, non-consumable products.
 */
@CapacitorPlugin(name = "VertigoBilling")
public class VertigoBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billing;
    private final Map<String, ProductDetails> details = new HashMap<>();
    /** the purchase flow in progress, answered from onPurchasesUpdated */
    private PluginCall purchaseCall;

    @Override
    public void load() {
        billing = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
    }

    @PluginMethod
    public void connect(final PluginCall call) {
        if (billing.isReady()) {
            call.resolve(okResult(true));
            return;
        }
        final boolean[] answered = { false };
        billing.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (answered[0]) return;
                answered[0] = true;
                call.resolve(okResult(r.getResponseCode() == BillingClient.BillingResponseCode.OK));
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection() reconnects on the next request
            }
        });
    }

    @PluginMethod
    public void queryProducts(final PluginCall call) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            JSArray ids = call.getArray("ids");
            for (String id : ids.<String>toList()) {
                products.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
            }
        } catch (JSONException | NullPointerException e) {
            call.reject("ids must be an array of product ids");
            return;
        }
        if (products.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            call.resolve(empty);
            return;
        }
        billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build(), (result, res) -> {
            JSArray out = new JSArray();
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (ProductDetails d : res.getProductDetailsList()) {
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    if (offer == null) continue;
                    details.put(d.getProductId(), d);
                    JSObject j = new JSObject();
                    j.put("productId", d.getProductId());
                    // the price exactly as Play shows it, in the player's currency
                    j.put("formattedPrice", offer.getFormattedPrice());
                    out.put(j);
                }
            }
            JSObject ret = new JSObject();
            ret.put("products", out);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        String productId = call.getString("productId", "");
        String account = call.getString("obfuscatedAccountId", "");
        ProductDetails d = details.get(productId);
        if (d == null) {
            answer(call, "ERROR", null, "unknown product");
            return;
        }
        if (purchaseCall != null) {
            answer(call, "ERROR", null, "a purchase is already in progress");
            return;
        }
        BillingFlowParams.Builder params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build()));
        // ties the order to the game account so the server can match it (max 64 chars)
        if (account != null && !account.isEmpty() && account.length() <= 64) params.setObfuscatedAccountId(account);
        final BillingFlowParams flow = params.build();
        purchaseCall = call;
        getActivity().runOnUiThread(() -> {
            BillingResult r = billing.launchBillingFlow(getActivity(), flow);
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                PluginCall c = purchaseCall;
                purchaseCall = null;
                if (c != null) answer(c, codeName(r.getResponseCode()), null, r.getDebugMessage());
            }
        });
    }

    @PluginMethod
    public void queryPurchases(final PluginCall call) {
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (result, list) -> {
            JSObject ret = new JSObject();
            ret.put("purchases", result.getResponseCode() == BillingClient.BillingResponseCode.OK ? toJs(list) : new JSArray());
            call.resolve(ret);
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall c = purchaseCall;
        purchaseCall = null;
        if (c == null) {
            // Purchases arriving outside a purchase flow: a pending purchase that completed,
            // or one made from the Play Store app. The game verifies them with the server.
            if (purchases != null && !purchases.isEmpty()) {
                JSObject ev = new JSObject();
                ev.put("purchases", toJs(purchases));
                notifyListeners("purchasesUpdated", ev);
            }
            return;
        }
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase p = purchases.get(0);
            answer(c, p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "PENDING" : "OK", toJs(p), null);
        } else {
            answer(c, codeName(code), null, result.getDebugMessage());
        }
    }

    // ------------------------------------------------------------------ helpers

    private static String codeName(int code) {
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) return "USER_CANCELED";
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) return "ITEM_ALREADY_OWNED";
        return "ERROR";
    }

    private static JSObject okResult(boolean ok) {
        JSObject r = new JSObject();
        r.put("ok", ok);
        return r;
    }

    private static void answer(PluginCall call, String result, JSObject purchase, String message) {
        JSObject r = new JSObject();
        r.put("result", result);
        if (purchase != null) r.put("purchase", purchase);
        if (message != null) r.put("message", message);
        call.resolve(r);
    }

    private static JSObject toJs(Purchase p) {
        JSObject j = new JSObject();
        List<String> ids = p.getProducts();
        j.put("productId", ids.isEmpty() ? "" : ids.get(0));
        j.put("purchaseToken", p.getPurchaseToken());
        j.put("orderId", p.getOrderId() == null ? "" : p.getOrderId());
        j.put("purchaseState", p.getPurchaseState());
        j.put("acknowledged", p.isAcknowledged());
        return j;
    }

    private static JSArray toJs(List<Purchase> list) {
        JSArray a = new JSArray();
        if (list != null) for (Purchase p : list) a.put(toJs(p));
        return a;
    }
}
