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

### ios submit

```sh
[bundle exec] fastlane ios submit
```

Submit an already-uploaded build for App Store review: build:"N" version:"1.0.0"

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
