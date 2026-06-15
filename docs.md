## Get Page Access Token

https://developers.facebook.com/tools/explorer/1031329456250001/
https://developers.facebook.com/apps/1031329456250001/settings/basic/

### Get LONG_LIVED_USER TOKEN
```
curl -G "https://graph.facebook.com/v21.0/oauth/access_token" \
  --data-urlencode "grant_type=fb_exchange_token" \
  --data-urlencode "client_id=YOUR_APP_ID" \
  --data-urlencode "client_secret=YOUR_APP_SECRET" \
  --data-urlencode "fb_exchange_token=SHORT_LIVED_USER_TOKEN"
```

```
curl -G "https://graph.facebook.com/v21.0/me/accounts" \
  --data-urlencode "access_token=LONG_LIVED_USER_TOKEN"
```
