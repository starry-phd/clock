#!/usr/bin/env python3
"""Clock source-only checks; no network, secrets or remote side effects."""
import argparse, json, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(); p.add_argument('--checks',choices=['static','eas','store'],default='static'); args=p.parse_args()
app=json.loads((root/'apps/clock/app.json').read_text())['expo']
eas=json.loads((root/'apps/clock/eas.json').read_text())
checks={
 'app slug clock':app['slug']=='clock',
 'Android package':app['android']['package']=='phd.starry.clock',
 'iOS bundle ID':app['ios']['bundleIdentifier']=='phd.starry.clock',
 'Ads disabled':app['extra']['adsEnabled'] is False,
 'Android icon':(root/'apps/clock/assets/icon.png').exists(),
 'Android adaptive icon':(root/'apps/clock/assets/adaptive-icon.png').exists(),
 'preview APK':eas['build']['preview']['android']['buildType']=='apk',
 'production AAB':eas['build']['production']['android']['buildType']=='app-bundle',
 'Android submit internal':eas['submit']['production']['android']['track']=='internal',
 'submit draft':eas['submit']['production']['android']['releaseStatus']=='draft',
 'Microphone disabled':app['android'].get('blockedPermissions')==['android.permission.RECORD_AUDIO'] and any(isinstance(x,list) and x[0]=='expo-audio' and x[1].get('recordAudioAndroid') is False and x[1].get('microphonePermission') is False and x[1].get('enableBackgroundPlayback') is False for x in app['plugins']),
}
if args.checks in ('eas','store'):
 checks['pnpm lockfile committed']=(root/'pnpm-lock.yaml').exists()
 checks['Expo EAS projectId initialized']=bool(app.get('extra',{}).get('eas',{}).get('projectId'))
if args.checks=='store':
 checks['privacy URL configured']=bool(app.get('extra',{}).get('privacyPolicyUrl'))
for name,good in checks.items():print(('PASS' if good else 'BLOCK')+' '+name)
sys.exit(0 if all(checks.values()) else 1)
