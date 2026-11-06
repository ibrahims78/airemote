am force-stop com.airemote.agent
am start -n com.airemote.agent/.SessionOfferActivity --es offerJson "$(cat /sdcard/offer.json)"
