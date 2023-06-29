# Testfile with numbers

This file exist to check all formats and store regression tests

### C-style numbers

10 numeral system:

	4096

16 numeral system:

	0xbabadeda

2 numeral system:

	0b101100101

8 numeral system:

	0176

### 65xx assembler notation

16 numeral system:

	$deadbeaf

2 numeral system:

	%10100010

## Regression tests

### Error with regular expression for number selection

	 123456, [0x987], (0b1110)
	 -45 + 5 = 178;
