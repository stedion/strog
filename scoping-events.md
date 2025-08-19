# scoping-events (future concept / not implemented)

This file describes exploratory ideas (async `scope()` helper, implicit time-range association). The current shipped API does NOT include `scope()` or automatic attachment of span IDs to arbitrary console lines. See `scope.spec.md` for the implementation summary.

if we include a method called `scope()` we can wrap with try/catch so that we can add the Strog `__id__` to the the thrown object and rethrow it and the `__id__` attached to the thrown object should now be available to the tail. this is one way to associate thrown errors to a given span.

```ts
const ORDER = Strog ( 'ORDER', {start: ['order_id', 'user_id'],end: ['duration_ms:dist', 'status:set']} );
await ORDER.scope ( async ( span ) => {
	span.addAttr('ORDER_LINEITEM',['item_id:set','qty:counter','subtotal:counter']);
	span.addAttr('ORDER_TOTALS', ['subtotal:counter','tax:counter','total:counter']);
	// business logic
	console.info(span.start`Starting order process for order id:${orderid} assigned to user:${userid}`);
	// more business logic
	console.info(span.ORDER_LINEITEM`Add item:${lineitems[i].itemid} quantity:${lineitems[i].qty} subtotal:${lineitems[i].sub}`);
	// more business logic
	console.info(span.end`Time to process`)
```

But this is ugly and (if added) would only be used when parallelism / Promise.all introduces ambiguity. For now consumers reconstruct hierarchy purely from emitted IDs (no time-window inference in library).

```ts
const REQUEST = Strog('request-start', ['user_id','country_code']); // starts this span when tagged in console log message
REQUEST.end('request-end',['duration_ms:dist', 'status:set']); // ends the span

const ORDER = REQUEST.span('order-start', ['order_id'] ); // a start span, child of REQUEST span
ORDER.addAttr('order-lineitem',['item_id:set','qty:counter','subtotal_cents:counter']); // adds an attribute to the span
ORDER.addAttr('order-totals', ['subtotal_cents:counter','tax_cents:counter','total:counter']); // adds an attribute to the span
ORDER.end('order-end', ['status:set','duration_ms:dist'] ); // ends the span, returning the tracking of scope back to REQUEST span

const PAYMENT = REQUEST.span('payment-start', ['order_id','currency','method'] );
PAYMENT.addAttr('payment-totals', ['amount_cents:counter']);
PAYMENT.end('payment-end', ['duration_ms:dist', 'status:set'] );

// some code that could throw something but is not yet scoped to any span

console.info(REQUEST`Order payment request started by user:${userid} in:${countrycode}`); // the REQUEST span has started

// any unstructured log or throw after this moment shall be associated to the REQUEST span which is considered current until it ends or a new child span has started

console.info(ORDER`Starting fetch of order:${orderid}`); // the ORDER span has started

// now any log or throw after this moment shall be associated to the ORDER span (considered current based on time-range)

console.info(ORDER.end`Order fetched successfully:${orderfetchstatus} in ${orderfetchms}ms`); // ORDER span has ended, scope returns to its ongoing parent scope (REQUEST)

console.warn(`Some unstructured log warning`); // associated to currently-scoped REQUEST

console.info(PAYMENT`Payment submission started for order:${orderid} with currency: ${currency} using: ${paymentmethod}`);// PAYMENT span has started, child of REQUEST scope

// something throws unexpectedly and, based on time ranges, the error is associated to PAYMENT span
```







