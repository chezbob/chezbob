function chooseEvent() {
  let r = Math.random(); // in [0, 1)
  let events = [
    ["March 4, 1837", 'The practice of all my predecessors imposes on me an obligation I cheerfully fulfill&#8212;to accompany the first and solemn act of my public trust with an avowal of the principles that will guide me in performing it and an expression of my feelings on assuming a charge so responsible and vast. In imitating their example I tread in the footsteps of illustrious men, whose superiors it is our happiness to believe are not found on the executive calendar of any university. Among their principles we recognize the earliest and firmest pillars of the Department&#8212;that those who fall into debt at Chez Bob must repay it at their earliest convenience, lest we devolve into financial ruin; and that those of us who leave bounties of free food in Chez Bob must retrieve the unclaimed remnants of these offerings at the end of the day, for I do not wish to do battle with the Mold Monster once again.'],
    ["April 9, 2026", 'Sorin chuckled. "You mean the Chaos Emeralds?"'],
    ["April 14, 2029", "[cse-grads] URGENT: do grad students have to pay taxes?"],
    ["January 15, 2040", 'Deian ran his mechanical-keyboard-calloused fingers through his spiked-up hair. His hair was always styled in a cool way like that, in much the same way that the <span class="italian">wellFormed</span> predicate "...is an invariant that Firefox flow functions depend on to be correct" (Brown, Renner, Nötzli, Schacham, Lerner, Stefan 2020). "It looks," Deian whispered to himself, "like I need to program this language."'],
    ["October 5, 2063", '[cse-grads] Looking for help with an interdisciplinary research project in the Political Science Department!'],
    ["October 26, 2063", '[cse-grads] STATEMENT ABOUT ONGOING EVENTS IN EBU3B<br /><br />This is a reminder to all CSE graduate students, faculty members, and staff that the University owns the Computer Science and Engineering Building, and that any attempts by graduate students to "establish the free state of Bobland" in Chez Bob are not legally binding in the eyes of the United Nations. Please keep your distance from CSE 3154 for the time being until the situation is under control.<br /><br />We would like to direct our message now to the self-styled "Costcocore Post-Python Revolutionaries" still holed up in Chez Bob after a week. There is still time to change your ways. We implore you to please just undo the espresso machine barricade and come out quietly, and we will let it slide.']
  ];
  // this should always find a valid entry in events, since r can never be 1
  let chosenEvent = events[Math.floor(r * events.length)];
  let eventHeader = document.getElementById("real-history-header");
  let eventText = document.getElementById("real-history-text");
  eventHeader.innerHTML = chosenEvent[0];
  eventText.innerHTML = chosenEvent[1];
}

chooseEvent();
