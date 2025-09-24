We want to create a tool that will allow us to track stats from specific call of duty matches. 

This tool will allow us to record data, tagged with relevant info, and return that data in a csv. 

Expected UI/UX:
User inputs a few pieces of info before starting a session:
1. link to match page
2. the user selects a player from a dropdown of players
3. the user selects a game/mode from a dropdown on options


There is a box with a list of the lives tracked so far. Once the user inputs data on a life, it gets added to this list. The user can re-edit the entry by clicking on it. 

The user inputs data and clicks submit to store that data for the next incremental life. The life gets added to the list on the right. The life is annotated with this data:
match | game/mode | player | life num | score | good route 0/1 | bad route 0/1 | etc. for other selectables. 