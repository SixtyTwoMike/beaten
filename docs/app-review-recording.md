# App Review screen recording

Apple asked (Guideline 2.1) for a recording on a physical iPhone running the
latest iOS, starting from launch. Use the TestFlight build you're submitting.
Aim for 3–5 minutes; no narration needed.

## Before you start

- Install the build from TestFlight; update the iPhone to the latest iOS.
- Delete the app first if it's installed, so the recording starts signed out.
- Settings > Control Centre: add Screen Recording. Turn on Do Not Disturb.
- Have two accounts ready: a throwaway you'll sign up and then delete, and
  the App Review demo account, which follows an account with reviews.

## Shot list

1. **Launch.** Start recording on the home screen, tap the Beaten icon.
2. **Registration.** Tap "Create an account", fill in the form on
   beaten.games, show the confirmation email arriving (Mail), tap the link,
   return to the app and sign in with the new account.
3. **Logging.** Home > Log a game > search "Hades" > + > Beaten > 4 stars,
   a short review > Save. Show it on Home and in Library > Diary.
4. **Shelves.** Library > Shelves > + > make a shelf.
5. **Account deletion (throwaway account).** Profile > scroll > Delete
   account > enter the password > Delete my account. Show it lands on
   sign-in.
6. **Sign in** with the demo account.
7. **User-generated content.** Activity: show a friend's review; tap the
   smiley and react; tap Comment, post a comment, then swipe to delete it.
8. **Reporting.** Long-press a review > Report review (Mail opens with it
   quoted; cancel). Open the comments, long-press a comment > Report comment.
9. **Blocking.** Tap the friend's name > ... > Block > confirm. Show the
   button becomes Unblock and their review is gone from Activity. Tap
   Unblock to put it back.
10. **Notifications.** Activity > bell; tap one to open the review. Gear >
    email frequency.
11. **Extras.** Profile > Console Chronicles, Year in review (start a video).
12. Stop recording.

There's no paid content, so nothing to show for that.

## Then

Trim the start and end in Photos, AirDrop it to the Mac, and attach it in
App Store Connect > the version > App Review Information > Attachment (or
send it to Claude to upload). The notes in `ios/fastlane/review_notes.txt`
go in with `fastlane metadata`.
