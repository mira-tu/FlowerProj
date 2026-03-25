import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Circle,
} from 'react-native-svg';

const AdminHeroGraphic = () => (
  <View style={styles.wrapper}>
    <Svg width="100%" height="100%" viewBox="0 0 320 236">
      <Defs>
        <LinearGradient id="cardGradient" x1="24" y1="12" x2="296" y2="224" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FBCFE8" />
          <Stop offset="0.55" stopColor="#F472B6" />
          <Stop offset="1" stopColor="#BE185D" />
        </LinearGradient>
        <LinearGradient id="petalGradient" x1="120" y1="58" x2="196" y2="182" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFDFB" />
          <Stop offset="1" stopColor="#FCE7F3" />
        </LinearGradient>
        <LinearGradient id="leafGradient" x1="84" y1="144" x2="246" y2="190" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#D1FAE5" />
          <Stop offset="1" stopColor="#86EFAC" />
        </LinearGradient>
        <LinearGradient id="centerGradient" x1="126" y1="95" x2="182" y2="151" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FB7185" />
          <Stop offset="1" stopColor="#E11D48" />
        </LinearGradient>
      </Defs>

      <Rect x="10" y="8" width="300" height="220" rx="34" fill="url(#cardGradient)" />
      <Ellipse cx="98" cy="58" rx="96" ry="38" fill="#FFFFFF" opacity="0.14" />
      <Ellipse cx="242" cy="174" rx="78" ry="28" fill="#FFF1F2" opacity="0.18" />
      <Path d="M70 171C102 148 132 148 160 170C134 192 104 194 70 171Z" fill="url(#leafGradient)" opacity="0.95" />
      <Path d="M160 173C186 149 218 149 252 170C220 194 191 194 160 173Z" fill="url(#leafGradient)" opacity="0.86" />

      <G origin="160,118" rotation="-18">
        <Ellipse cx="160" cy="84" rx="28" ry="56" fill="url(#petalGradient)" />
      </G>
      <G origin="160,118" rotation="54">
        <Ellipse cx="160" cy="84" rx="28" ry="56" fill="url(#petalGradient)" />
      </G>
      <G origin="160,118" rotation="126">
        <Ellipse cx="160" cy="84" rx="28" ry="56" fill="url(#petalGradient)" />
      </G>
      <G origin="160,118" rotation="198">
        <Ellipse cx="160" cy="84" rx="28" ry="56" fill="url(#petalGradient)" />
      </G>
      <G origin="160,118" rotation="270">
        <Ellipse cx="160" cy="84" rx="28" ry="56" fill="url(#petalGradient)" />
      </G>

      <Circle cx="160" cy="118" r="28" fill="url(#centerGradient)" />
      <Circle cx="160" cy="118" r="12" fill="#881337" />

      <G>
        <Rect x="212" y="144" width="70" height="70" rx="19" fill="#FFFFFF" />
        <Rect x="220" y="152" width="54" height="54" rx="15" fill="#881337" />
        <Path d="M233 169H263" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Path d="M229 179H257" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Path d="M237 189H265" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Circle cx="242" cy="169" r="4" fill="#FFFFFF" />
        <Circle cx="252" cy="179" r="4" fill="#FFFFFF" />
        <Circle cx="245" cy="189" r="4" fill="#FFFFFF" />
      </G>
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    width: 320,
    height: 236,
    alignSelf: 'center',
  },
});

export default AdminHeroGraphic;
