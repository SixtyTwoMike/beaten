fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build and upload to TestFlight. Pass version:"1.0.1" to override MARKETING_VERSION.

### ios distribute

```sh
[bundle exec] fastlane ios distribute
```

Give the latest processed build to an external TestFlight group (no rebuild)

### ios testers

```sh
[bundle exec] fastlane ios testers
```

Add App Store Connect team members to the internal TestFlight group (every build, no Beta App Review). email:"…" (must be on the App Store Connect team)

### ios builds

```sh
[bundle exec] fastlane ios builds
```

Recent TestFlight builds

### ios appinfo

```sh
[bundle exec] fastlane ios appinfo
```

What App Store Connect has for the app: locale, names, version state

### ios metadata

```sh
[bundle exec] fastlane ios metadata
```

Upload the App Store listing (metadata, age rating, review details) without submitting; screenshots:true replaces the screenshots too

### ios age_rating

```sh
[bundle exec] fastlane ios age_rating
```

Set the age rating answers from fastlane/age_rating.json

### ios review_version

```sh
[bundle exec] fastlane ios review_version
```

Submit an already-uploaded build for App Store review: build:"N" version:"1.0.0"

Rename the version being edited (before its first release): version:"1.1.0"

### ios review_build

```sh
[bundle exec] fastlane ios review_build
```

Attach a TestFlight build to the version being edited: build:"9"

### ios review_attach

```sh
[bundle exec] fastlane ios review_attach
```

Attach a file (the App Review screen recording) to the version's review details: path:"…"

### ios review_status

```sh
[bundle exec] fastlane ios review_status
```

Where the version being edited stands: state, build, attachments

### ios asc_get

```sh
[bundle exec] fastlane ios asc_get
```

Raw GET against the App Store Connect API: path:"/v1/..."

### ios resubmit

```sh
[bundle exec] fastlane ios resubmit
```

Resubmit the open review submission (after a rejection), with the version being edited

### ios submit

```sh
[bundle exec] fastlane ios submit
```



----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
