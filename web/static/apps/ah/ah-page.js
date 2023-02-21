function chooseEvent() {
  let r = Math.random(); // in [0, 1)
  let events = [
    ["March 4, 1837", '"The practice of all my predecessors imposes on me an obligation I cheerfully fulfill&#8212;to accompany the first and solemn act of my public trust with an avowal of the principles that will guide me in performing it and an expression of my feelings on assuming a charge so responsible and vast. In imitating their example I tread in the footsteps of illustrious men, whose superiors it is our happiness to believe are not found on the executive calendar of any university. Among their principles we recognize the earliest and firmest pillars of the Department&#8212;that those who fall into debt at Chez Bob must repay it at their earliest convenience, lest we devolve into financial ruin; and that those of us who leave bounties of free food in Chez Bob must retrieve the unclaimed remnants of these offerings at the end of the day, for I do not wish to do battle with the Mold Monster once again."'],
    ["December 2, 2017", "You thought you were unlovable until you met him. You thought that the world had moved on without you, that the litany of happy couples you'd see walking by from your office window every evening was proof positive from the universe that everyone but you had earned their happy ending. You thought that being consigned to your little desk in your little office in your little building on your little campus was not so bad a fate, really, because at least there was good food to eat and good work to do and good sleep to sleep. What more would a creature like you need?<br/><br/>But oh, miracle of miracles! He sees you. When you would give anything for the people you walk by every day to not notice your existence&#8212;to not afford you the injustice of pity, even&#8212;his eyes lock with yours and he smiles and he introduces himself and the heavens part and you agree to \"grab a coffee\" with him because even the devil does not turn down cherubim.<br/><br/>Wednesday evenings are your shared bedrock. There's a path by student housing, a sandy trail down a hill hidden at first by trees that open up twelve paces in to a scarlet sky at sunset. You no longer walk the path alone after dark, at least on Wednesdays: on Wednesdays the both of you meander down, your hand in his, stopping by a grove of trees near the bottom that covers you on all sides. His breath is honey and ambrosia and everything Prometheus stole from the gods. Was it like this for everyone?<br/><br/>You come to rely on that playful glint in his eyes, which makes it all the more jarring when it is absent one Wednesday. He is there, but&#8212;no matter how close you cuddle up to him or how tightly you squeeze his hand on the way down&#8212;something about him is missing.<br/><br/>At the grove, he looks around uneasily and steps away from you. You let his hand go with some hesitancy: is this a goodbye? It can't be. You'll fall apart. He shakes his head, as if steeling himself to do something. You lock eyes again and you realize that his are welling up with tears. He struggles to get the words out, but they are clear as day. \"Pay your debts at Chez Bob.\""],
    ["April 9, 2026", 'Sorin chuckled. "You mean the Chaos Emeralds?"'],
    ["April 14, 2029", "[cse-grads] URGENT: do grad students have to pay taxes?"],
    ["August 29, 2033", "[SCENE: A PROFESSOR'S OFFICE. Bookshelves lined with technical volumes cover the EAST and WEST walls. At the SOUTH WALL, a wide window peers out into a courtyard three stories below containing a stone statue of a bear. A PROFESSOR sits at his desk, facing away from the window. He leans back in his chair, both his hands resting behind his head. Two GRADUATE STUDENTS sit facing the professor, both of them perched ramrod-straight on uncomfortable chairs. They are bundles of nerves.]<br /><br />PROFESSOR: I think that settles everything. Do you two have any more questions?<br /><br />STUDENT 1: Um...<br /><br />[STUDENT 1 glances briefly at STUDENT 2.]<br /><br />STUDENT 2: We were wondering about one of the things you said earlier at orientation. About how, um, the classes don't actually matter in grad school.<br /><br />PROFESSOR: Sure, sure. Well&#8212;they don't! What about it?<br /><br />STUDENT 2: Well, uh... It's unusual to me. Unusual to both of us. Like,<br /><br />[STUDENT 2 nods at STUDENT 1, who nods at the PROFESSOR to show his support.]<br /><br />STUDENT 2: We're both used to being undergrads, and&#8212;the idea that you can just, like, not care about your classes. It doesn't seem right to us.<br /><br />[The PROFESSOR inclines his head, moving his hands back to a more natural resting position. He is affording this conversation an infinitesimally larger grain of attention than before.]<br /><br />PROFESSOR: Look, here's how I think about it. You're here to do work. You're here to do research and teach. The classes are just something you've gotta get through. You really don't have to worry about them, except for the ***********. And you two probably won't have to worry about that. My advice will always be to focus on the more important stuff you've got going on.<br /><br />[STUDENT 2 smiles, nodding slightly. Hers is the forced smile of a subordinate who recognizes that one stays on the path of least resistance by acting grateful, even in the face of a non-answer.]<br /><br />STUDENT 1: Thank you. That makes sense. But, uh, the ***********? What's that?<br /><br />PROFESSOR: Oh. Like I said, it's not a big deal. I wouldn't worry about it.<br /><br />STUDENT 1: Okay. Thanks. I'd&#8212;I'd like to know, though. Just in case.<br /><br />STUDENT 2: Mhm. I'm curious.<br /><br />[The PROFESSOR sighs.]<br /><br />PROFESSOR: Well, okay. We don't normally tell students about this, but I think you two should be safe. Long as you don't tell any other grad students.<br /><br />[The PROFESSOR looks conspiratorially at STUDENT 2, then STUDENT 1. A hint of a smile graces his face.]<br /><br />PROFESSOR: Got it? Hush-hush.<br /><br />[STUDENT 1 and STUDENT 2 nod hesitantly.]<br /><br />PROFESSOR: So, you know that forest we have on campus?<br /><br />STUDENT 1: Like, over by the parking garage? The big eucalyptus forest?<br /><br />PROFESSOR: Yeah. So, once a year or so, us professors like to ***** ** *** *** **** ******** ** *** ********** **** *** ***** *** ** ************* **** ***** **** **** ******* ******* *** ******* ** **** ** **** * **** *** ** ************* *** **** ******* * *********** **** ****** *** ***** **** ***** **** ******* ***** *****<br /><br />[The students' smiles fade. Panic sets in for both of them as they start to realize that this isn't a joke.]<br /><br />PROFESSOR: But like I said, I wouldn't worry about it. You two seem smart. It's what I always say&#8212;I really don't think your classes matter that much in grad school."],
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
