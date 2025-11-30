import WidgetKit
import SwiftUI

@main
struct EATradeWidgetBundle: WidgetBundle {
    var body: some Widget {
        EATradeWidget()
        EATradeWidgetLiveActivity()
    }
}
