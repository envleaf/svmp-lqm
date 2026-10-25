SvMP (Simple/Shitty vibecoded Music Player) is a small project I am running using Google Jule's free LLM model. Currently, its status is: Works on my machine(TM).
It was originally a very simple section on my person website for playing background music, which is why it is coded almost entirely in JS and HTML. A Go backend exists to run a webserver to run this HTML on, as well as interact with the host system.
Yes, it is horribly inefficient. No, its not going to change as my attempts to get Jules to rewrite SvMP have been highly unsuccessful. 

#### Very, very few lines of code are human-generated. Things I made for the project myself include:
- svmp-lqm.png
- README.md
- Some lines in AGENTS.md

#### Dependencies (if, for some reason, you want to unleash this horrible abomination unto your machine):
 - Go
 - webkitgtk-4.1

#### Why Simple/Shitty
you decide idk

#### What does LQM mean?
i dont know

#### Things you might find odd
- Playlists are .txt files stored in /playlists, with relative paths to each music file (this makes them portable, kind of, but also easy to manage)
- The UI is unique (up to you if thats a good or bad thing)
- This overcomplicated .mp3 player has both frameworks for notifications and commands.
- app.js is fucking massive

### Screenshots
Main Screen

<img width="1918" height="1080" alt="image" src="https://github.com/user-attachments/assets/0f49bbfb-a684-418e-850b-20e470358c7b" />

Theming

<img width="1918" height="1080" alt="image" src="https://github.com/user-attachments/assets/17b35820-326e-4b31-96a0-5b5290ca8370" />

Options and Notifications

<img width="1918" height="1080" alt="image" src="https://github.com/user-attachments/assets/24f52f72-d3aa-4171-bba2-59e2ce12ef22" />

Focus Mode

<img width="1918" height="1080" alt="image" src="https://github.com/user-attachments/assets/73f2e8ec-9af7-40b6-8047-b5831de056cf" />

Info Screen

<img width="1917" height="1080" alt="image" src="https://github.com/user-attachments/assets/644d0492-abe9-4571-848d-e18a92f70dc3" />

Lyrics

<img width="696" height="362" alt="image" src="https://github.com/user-attachments/assets/23fc4241-6524-4ebd-a613-cc9cc25243b0" />

Command Pallete

<img width="600" height="306" alt="image" src="https://github.com/user-attachments/assets/309e7cf7-e1e3-446e-848b-2cf25090f8e9" />

